package bot

import (
	"context"
	"crypto/rand"
	"database/sql"
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
	Bot.Handle("/week", handleWeek)
	Bot.Handle("/month", handleMonth)
	Bot.Handle("/summary", handleSummary)
	Bot.Handle("/help", handleHelp)
	Bot.Handle("/whoami", handleWhoami)

	go Bot.Start()
	go cleanupExpiredCodes()
	go scheduleDailySummaries()

	return nil
}

// cleanupExpiredCodes removes expired login codes from memory every minute.
func cleanupExpiredCodes() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		loginCodesMu.Lock()
		for code, entry := range loginCodes {
			if time.Now().After(entry.ExpiresAt) {
				delete(loginCodes, code)
			}
		}
		loginCodesMu.Unlock()
	}
}

// scheduleDailySummaries sends a daily spending summary at 9 PM IST to opted-in users.
func scheduleDailySummaries() {
	ist := time.FixedZone("IST", 5*60*60+30*60)
	for {
		now := time.Now().In(ist)
		next := time.Date(now.Year(), now.Month(), now.Day(), 21, 0, 0, 0, ist)
		if !next.After(now) {
			next = next.Add(24 * time.Hour)
		}
		<-time.After(time.Until(next))
		sendDailySummaries()
	}
}

func sendDailySummaries() {
	if Bot == nil || Queries == nil {
		return
	}
	users, err := Queries.ListUsersForDailySummary(context.Background())
	if err != nil {
		log.Printf("[dailySummary] error listing users: %v", err)
		return
	}
	today := time.Now().Format("2006-01-02")
	for _, user := range users {
		total, err := Queries.GetTotalExpensesForUserByDateRange(context.Background(), db.GetTotalExpensesForUserByDateRangeParams{
			UserID: user.ID,
			Date:   today,
			Date_2: today,
		})
		if err != nil {
			log.Printf("[dailySummary] error for user_id=%d: %v", user.ID, err)
			continue
		}
		amount, ok := total.(float64)
		if !ok {
			continue
		}

		categories, err := Queries.ListCategoriesForUser(context.Background(), user.ID)
		if err != nil || len(categories) == 0 {
			continue
		}

		// Get per-category breakdown for today
		expenses, err := Queries.GetExpensesForUserByDateRange(context.Background(), db.GetExpensesForUserByDateRangeParams{
			UserID: user.ID,
			Date:   today,
			Date_2: today,
		})
		if err != nil {
			log.Printf("[dailySummary] error getting expenses for user_id=%d: %v", user.ID, err)
			continue
		}

		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("🌙 *Daily Summary — %s*\n\n", time.Now().Format("Mon, Jan 2")))

		if len(expenses) == 0 {
			sb.WriteString("Nothing logged today. 👍")
		} else {
			// Group by category
			catTotals := map[int64]float64{}
			catInfo := map[int64]db.GetExpensesForUserByDateRangeRow{}
			for _, e := range expenses {
				catTotals[e.CategoryID] += e.Amount
				catInfo[e.CategoryID] = e
			}
			for catID, catTotal := range catTotals {
				info := catInfo[catID]
				sb.WriteString(fmt.Sprintf("%s %s — *₹%.2f*\n", info.CategoryEmoji, info.CategoryName, catTotal))
			}
			sb.WriteString(fmt.Sprintf("\n💰 *Total: ₹%.2f*", amount))
		}

		_, err = Bot.Send(&telebot.User{ID: user.TelegramID}, sb.String(), &telebot.SendOptions{ParseMode: "Markdown"})
		if err != nil {
			log.Printf("[dailySummary] failed to send to telegram_id=%d: %v", user.TelegramID, err)
		}
	}
}

func handleText(c telebot.Context) error {
	text := strings.TrimSpace(c.Message().Text)
	if len(text) == 0 {
		return nil
	}

	// Support "50" or "50 lunch with friends" format
	fields := strings.SplitN(text, " ", 2)
	amount, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return nil
	}

	amount = math.Round(amount*100) / 100

	note := ""
	if len(fields) > 1 {
		note = strings.TrimSpace(fields[1])
	}

	sender := c.Sender()
	if sender == nil {
		return nil
	}
	user := ensureUser(sender)
	if user.ID == 0 {
		log.Printf("[handleText] ensureUser returned zero ID for telegram_id=%d", sender.ID)
		return c.Send("❌ Could not find your account. Please try /start first.")
	}

	log.Printf("[handleText] user_id=%d telegram_id=%d amount=%.2f note=%q", user.ID, sender.ID, amount, note)

	categories, err := Queries.ListCategoriesForUser(context.Background(), user.ID)
	if err != nil {
		log.Printf("[handleText] DB error listing categories for user_id=%d: %v", user.ID, err)
		return c.Send("❌ Could not load your categories. Please try again in a moment.")
	}
	if len(categories) == 0 {
		log.Printf("[handleText] no categories found for user_id=%d", user.ID)
		return c.Send(
			"⚠️ *No categories found*\n\n"+
				"You need at least one category before logging expenses.\n\n"+
				"👉 Head to the web dashboard to create your categories, then come back and try again.",
			&telebot.SendOptions{ParseMode: "Markdown"},
		)
	}

	var rows [][]telebot.InlineButton
	for _, cat := range categories {
		// Stateless callback data: "log:categoryID:amount:note"
		callbackData := fmt.Sprintf("log:%d:%.2f:%s", cat.ID, amount, note)
		btn := telebot.InlineButton{
			Text: fmt.Sprintf("%s %s", cat.Emoji, cat.Name),
			Data: callbackData,
		}
		rows = append(rows, []telebot.InlineButton{btn})
	}

	markup := &telebot.ReplyMarkup{
		InlineKeyboard: rows,
	}

	prompt := fmt.Sprintf("💸 *₹%.2f* — which category?", amount)
	if note != "" {
		prompt = fmt.Sprintf("💸 *₹%.2f* _%s_ — which category?", amount, note)
	}

	return c.Send(prompt, &telebot.SendOptions{
		ParseMode:   "Markdown",
		ReplyMarkup: markup,
	})
}

func handleCallback(c telebot.Context) error {
	callback := c.Callback()
	if callback == nil {
		return nil
	}

	data := callback.Data
	// Format: "log:categoryID:amount:note" (note is optional)
	parts := strings.SplitN(data, ":", 4)
	if len(parts) < 3 || parts[0] != "log" {
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

	note := ""
	if len(parts) == 4 {
		note = parts[3]
	}

	user := ensureUser(callback.Sender)

	var noteSQL sql.NullString
	if note != "" {
		noteSQL = sql.NullString{String: note, Valid: true}
	}

	_, err = Queries.CreateExpense(context.Background(), db.CreateExpenseParams{
		UserID:     user.ID,
		CategoryID: catID,
		Amount:     amount,
		Note:       noteSQL,
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

	edited := fmt.Sprintf("✅ *₹%.2f* logged under %s %s", amount, cat.Emoji, cat.Name)
	if note != "" {
		edited = fmt.Sprintf("✅ *₹%.2f* _%s_ → %s %s", amount, note, cat.Emoji, cat.Name)
	}
	_, err = Bot.Edit(callback.Message, edited, &telebot.SendOptions{ParseMode: "Markdown"})
	if err != nil {
		log.Printf("Failed to edit message: %v", err)
	}

	return c.Respond(&telebot.CallbackResponse{Text: fmt.Sprintf("₹%.2f saved to %s %s", amount, cat.Emoji, cat.Name)})
}

func ensureUser(sender *telebot.User) db.User {
	user, err := Queries.GetUserByTelegramID(context.Background(), sender.ID)
	if err == nil {
		log.Printf("[ensureUser] found user_id=%d for telegram_id=%d", user.ID, sender.ID)
		return user
	}

	log.Printf("[ensureUser] user not found for telegram_id=%d, creating: %v", sender.ID, err)
	newUser, err := Queries.CreateUser(context.Background(), db.CreateUserParams{
		TelegramID: sender.ID,
		Name:       sender.FirstName,
	})
	if err != nil {
		log.Printf("[ensureUser] failed to create user for telegram_id=%d: %v", sender.ID, err)
		return db.User{}
	}

	log.Printf("[ensureUser] created user_id=%d for telegram_id=%d", newUser.ID, sender.ID)
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
			"   Add a note too: `50 lunch with friends`\n"+
			"3️⃣ Pick a category and it's saved instantly\n\n"+
			"*Commands*\n"+
			"/today — today's spending total\n"+
			"/week — this week's spending total\n"+
			"/month — this month's spending total\n"+
			"/summary — toggle daily summary at 9 PM\n"+
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
	msg := fmt.Sprintf("📊 *Today's spending* (%s)\n\n*₹%.2f*", today, total.(float64))
	return c.Send(msg, &telebot.SendOptions{ParseMode: "Markdown"})
}

func handleWeek(c telebot.Context) error {
	user := ensureUser(c.Sender())
	if user.ID == 0 {
		return c.Send("❌ Could not find your account. Please try again.")
	}
	now := time.Now()
	// Monday as start of week (1=Mon … 7=Sun)
	weekday := int(now.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	startOfWeek := now.AddDate(0, 0, -(weekday - 1))
	start := startOfWeek.Format("2006-01-02")
	end := now.Format("2006-01-02")

	total, err := Queries.GetTotalExpensesForUserByDateRange(context.Background(), db.GetTotalExpensesForUserByDateRangeParams{
		UserID: user.ID,
		Date:   start,
		Date_2: end,
	})
	if err != nil {
		log.Printf("Error getting week's total: %v", err)
		return c.Send("❌ Could not retrieve this week's total.")
	}

	msg := fmt.Sprintf("📅 *This week's spending* (%s – %s)\n\n*₹%.2f*",
		startOfWeek.Format("Jan 2"), now.Format("Jan 2"), total.(float64))
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
	msg := fmt.Sprintf("🗓️ *%s spending*\n\n*₹%.2f*", monthName, total.(float64))
	return c.Send(msg, &telebot.SendOptions{ParseMode: "Markdown"})
}

func handleSummary(c telebot.Context) error {
	user := ensureUser(c.Sender())
	if user.ID == 0 {
		return c.Send("❌ Could not find your account. Please try again.")
	}

	args := strings.TrimSpace(c.Message().Payload)
	var enable sql.NullBool

	switch strings.ToLower(args) {
	case "on":
		enable = sql.NullBool{Bool: true, Valid: true}
	case "off":
		enable = sql.NullBool{Bool: false, Valid: true}
	default:
		// Toggle current state
		if user.DailySummary.Valid && user.DailySummary.Bool {
			enable = sql.NullBool{Bool: false, Valid: true}
		} else {
			enable = sql.NullBool{Bool: true, Valid: true}
		}
	}

	err := Queries.UpdateUserConfig(context.Background(), db.UpdateUserConfigParams{
		Timezone:     user.Timezone,
		DailySummary: enable,
		ID:           user.ID,
	})
	if err != nil {
		log.Printf("[handleSummary] error updating user config: %v", err)
		return c.Send("❌ Could not update your settings. Please try again.")
	}

	if enable.Bool {
		return c.Send("✅ *Daily summary enabled*\n\nYou'll get a spending recap every evening at 9 PM IST.", &telebot.SendOptions{ParseMode: "Markdown"})
	}
	return c.Send("🔕 *Daily summary disabled*\n\nSend /summary to re-enable it.", &telebot.SendOptions{ParseMode: "Markdown"})
}

func handleWhoami(c telebot.Context) error {
	sender := c.Sender()
	user := ensureUser(sender)
	categories, _ := Queries.ListCategoriesForUser(context.Background(), user.ID)
	msg := fmt.Sprintf(
		"🔍 *Your account info*\n\n"+
			"Telegram ID: `%d`\n"+
			"DB User ID: `%d`\n"+
			"Name: %s\n"+
			"Categories: %d",
		sender.ID, user.ID, user.Name, len(categories),
	)
	return c.Send(msg, &telebot.SendOptions{ParseMode: "Markdown"})
}

func handleHelp(c telebot.Context) error {
	helpText :=
		"📖 *TrackDown Help*\n\n" +
			"*Logging an expense*\n" +
			"Send a number: `15.99`, `7`, `42`\n" +
			"Add a note: `50 lunch with friends`\n" +
			"I'll ask you which category to save it under.\n\n" +
			"*Commands*\n" +
			"/today — your total spending for today\n" +
			"/week — your total spending this week\n" +
			"/month — your total spending for the current month\n" +
			"/summary — toggle daily summary at 9 PM IST\n" +
			"/login — get a one-time code to sign in to the web dashboard\n" +
			"/help — show this message\n\n" +
			"*Managing categories*\n" +
			"Categories are managed from the web dashboard. Go there to add, rename, or delete them."
	return c.Send(helpText, &telebot.SendOptions{ParseMode: "Markdown"})
}
