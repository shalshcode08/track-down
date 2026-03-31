package bot

import (
	"context"
	"crypto/rand"
	"fmt"
	"log"
	"math"
	"math/big"
	"strconv"
	"strings"
	"sync"
	"time"

	"track-down-api/internal/db"

	"gopkg.in/telebot.v3"
)

var (
	Bot     *telebot.Bot
	Queries *db.Queries
)

// LoginCode stores a temporary login code mapped to a telegram user ID
type LoginCode struct {
	UserID    int64
	ExpiresAt time.Time
}

var (
	loginCodes   = map[string]LoginCode{}
	loginCodesMu sync.Mutex
)

// GenerateLoginCode creates a 6-digit code for the given telegram user and stores it
func GenerateLoginCode(telegramID int64) string {
	n, _ := rand.Int(rand.Reader, big.NewInt(900000))
	code := fmt.Sprintf("%06d", n.Int64()+100000)

	loginCodesMu.Lock()
	loginCodes[code] = LoginCode{UserID: telegramID, ExpiresAt: time.Now().Add(5 * time.Minute)}
	loginCodesMu.Unlock()

	return code
}

// RedeemLoginCode validates a code and returns the telegram user ID, or 0 if invalid/expired
func RedeemLoginCode(code string) int64 {
	loginCodesMu.Lock()
	defer loginCodesMu.Unlock()

	entry, ok := loginCodes[code]
	if !ok || time.Now().After(entry.ExpiresAt) {
		delete(loginCodes, code)
		return 0
	}
	delete(loginCodes, code)
	return entry.UserID
}

func Start(queries *db.Queries, token string) error {
	Queries = queries

	pref := telebot.Settings{
		Token:  token,
		Poller: &telebot.LongPoller{Timeout: 10 * time.Second},
	}

	var err error
	Bot, err = telebot.NewBot(pref)
	if err != nil {
		return err
	}

	Bot.Handle(telebot.OnText, handleText)
	Bot.Handle(telebot.OnCallback, handleCallback)
	Bot.Handle("/start", handleStart)
	Bot.Handle("/login", handleLogin)
	Bot.Handle("/today", handleToday)
	Bot.Handle("/month", handleMonth)
	Bot.Handle("/help", handleHelp)

	go func() {
		Bot.Start()
	}()

	return nil
}

func handleText(c telebot.Context) error {
	text := strings.TrimSpace(c.Message().Text)
	amount, err := strconv.ParseFloat(text, 64)
	if err != nil || len(text) == 0 {
		// Not a valid amount, ignore
		return nil
	}

	amount = math.Round(amount*100) / 100

	sender := c.Sender()
	if sender == nil {
		return nil
	}
	user := ensureUser(sender)

	categories, err := Queries.ListCategoriesForUser(context.Background(), user.ID)
	if err != nil || len(categories) == 0 {
		return c.Send(
			"⚠️ *No categories found*\n\n"+
				"You need at least one category before logging expenses.\n\n"+
				"👉 Head to the web dashboard to create your categories, then come back and try again.",
			&telebot.SendOptions{ParseMode: "Markdown"},
		)
	}

	var rows [][]telebot.InlineButton
	for _, cat := range categories {
		// Stateless callback data: "action:categoryID:amount"
		callbackData := fmt.Sprintf("log:%d:%.2f", cat.ID, amount)
		btn := telebot.InlineButton{
			Unique: fmt.Sprintf("cat-%d", cat.ID),
			Text:   fmt.Sprintf("%s %s", cat.Emoji, cat.Name),
			Data:   callbackData,
		}
		rows = append(rows, []telebot.InlineButton{btn})
	}

	markup := &telebot.ReplyMarkup{
		InlineKeyboard: rows,
	}

	return c.Send(fmt.Sprintf("💸 *$%.2f* — which category?", amount), markup, &telebot.SendOptions{ParseMode: "Markdown"})
}

func handleCallback(c telebot.Context) error {
	callback := c.Callback()
	if callback == nil {
		return nil
	}

	data := callback.Data
	parts := strings.Split(data, ":")
	if len(parts) != 3 || parts[0] != "log" {
		return c.Respond()
	}

	catID, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return c.Respond(&telebot.CallbackResponse{Text: "Invalid category ID.", ShowAlert: true})
	}

	amount, err := strconv.ParseFloat(parts[2], 64)
	if err != nil {
		return c.Respond(&telebot.CallbackResponse{Text: "Invalid amount in callback.", ShowAlert: true})
	}

	user := ensureUser(callback.Sender)

	_, err = Queries.CreateExpense(context.Background(), db.CreateExpenseParams{
		UserID:     user.ID,
		CategoryID: catID,
		Amount:     amount,
	})
	if err != nil {
		log.Printf("Error creating expense: %v", err)
		return c.Respond(&telebot.CallbackResponse{Text: "Error saving expense.", ShowAlert: true})
	}

	cat, err := Queries.GetCategoryByID(context.Background(), catID)
	if err != nil {
		log.Printf("Error getting category: %v", err)
		return c.Respond(&telebot.CallbackResponse{Text: "Error finding category.", ShowAlert: true})
	}

	edited := fmt.Sprintf("✅ *$%.2f* logged under %s %s", amount, cat.Emoji, cat.Name)
	_, err = Bot.Edit(callback.Message, edited, &telebot.SendOptions{ParseMode: "Markdown"})
	if err != nil {
		log.Printf("Failed to edit message: %v", err)
	}

	return c.Respond(&telebot.CallbackResponse{Text: fmt.Sprintf("$%.2f saved to %s %s", amount, cat.Emoji, cat.Name)})
}

func ensureUser(sender *telebot.User) db.User {
	user, err := Queries.GetUserByTelegramID(context.Background(), sender.ID)
	if err == nil {
		return user
	}

	newUser, err := Queries.CreateUser(context.Background(), db.CreateUserParams{
		TelegramID: sender.ID,
		Name:       sender.FirstName,
	})
	if err != nil {
		log.Printf("Failed to create user: %v", err)
		// Return an empty user on failure
		return db.User{}
	}

	return newUser
}

func handleLogin(c telebot.Context) error {
	user := ensureUser(c.Sender())
	if user.ID == 0 {
		return c.Send("❌ Could not create an account for you. Please try again in a moment.")
	}
	code := GenerateLoginCode(c.Sender().ID)
	msg := fmt.Sprintf(
		"🔐 *Your login code*\n\n"+
			"`%s`\n\n"+
			"1. Open the TrackDown web dashboard\n"+
			"2. Paste this 6-digit code to sign in\n\n"+
			"⏱ Expires in *5 minutes* — do not share it with anyone.",
		code,
	)
	return c.Send(msg, &telebot.SendOptions{ParseMode: "Markdown"})
}

func handleStart(c telebot.Context) error {
	user := ensureUser(c.Sender())
	if user.ID == 0 {
		return c.Send("❌ Could not create an account for you. Please try again in a moment.")
	}
	msg := fmt.Sprintf(
		"👋 *Welcome, %s!*\n\n"+
			"I'm your personal expense tracker. Here's how to get started:\n\n"+
			"1️⃣ Set up your categories on the web dashboard\n"+
			"2️⃣ Send me any amount to log an expense — e.g. `12.50` or `7`\n"+
			"3️⃣ Pick a category and it's saved instantly\n\n"+
			"*Commands*\n"+
			"/today — today's spending total\n"+
			"/month — this month's spending total\n"+
			"/login — get a code to access the dashboard\n"+
			"/help — show all commands\n\n"+
			"Ready? Just send me a number! 💸",
		user.Name,
	)
	return c.Send(msg, &telebot.SendOptions{ParseMode: "Markdown"})
}

func handleToday(c telebot.Context) error {
	user := ensureUser(c.Sender())
	if user.ID == 0 {
		return c.Send("❌ Could not find your account. Please try again.")
	}

	total, err := Queries.GetTotalExpensesForToday(context.Background(), user.ID)
	if err != nil {
		log.Printf("Error getting today's total: %v", err)
		return c.Send("❌ Could not retrieve today's total. Please try again later.")
	}

	today := time.Now().Format("Mon, Jan 2")
	msg := fmt.Sprintf("📊 *Today's spending* (%s)\n\n*$%.2f*", today, total.(float64))
	return c.Send(msg, &telebot.SendOptions{ParseMode: "Markdown"})
}

func handleMonth(c telebot.Context) error {
	user := ensureUser(c.Sender())
	if user.ID == 0 {
		return c.Send("Could not find your account.")
	}
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Format("2006-01-02")
	endOfMonth := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, now.Location()).Format("2006-01-02")

	total, err := Queries.GetTotalExpensesForUserByDateRange(context.Background(), db.GetTotalExpensesForUserByDateRangeParams{
		UserID: user.ID,
		Date:   startOfMonth,
		Date_2: endOfMonth,
	})
	if err != nil {
		log.Printf("Error getting month's total: %v", err)
		return c.Send("Could not retrieve this month's total.")
	}

	monthName := now.Format("January 2006")
	msg := fmt.Sprintf("🗓️ *%s spending*\n\n*$%.2f*", monthName, total.(float64))
	return c.Send(msg, &telebot.SendOptions{ParseMode: "Markdown"})
}

func handleHelp(c telebot.Context) error {
	helpText :=
		"📖 *TrackDown Help*\n\n" +
			"*Logging an expense*\n" +
			"Just send any number — `15.99`, `7`, `42` — and I'll ask you which category to save it under.\n\n" +
			"*Commands*\n" +
			"/today — your total spending for today\n" +
			"/month — your total spending for the current month\n" +
			"/login — get a one-time code to sign in to the web dashboard\n" +
			"/help — show this message\n\n" +
			"*Managing categories*\n" +
			"Categories are managed from the web dashboard. Go there to add, rename, or delete them."
	return c.Send(helpText, &telebot.SendOptions{ParseMode: "Markdown"})
}
