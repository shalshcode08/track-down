package bot

import (
	"context"
	"fmt"
	"log"
	"math"
	"strconv"
	"strings"
	"time"

	"track-down-api/internal/db"

	"gopkg.in/telebot.v3"
)

var (
	Bot     *telebot.Bot
	Queries *db.Queries
)

func Start(queries *db.Queries, token string) {
	Queries = queries

	pref := telebot.Settings{
		Token:  token,
		Poller: &telebot.LongPoller{Timeout: 10 * time.Second},
	}

	var err error
	Bot, err = telebot.NewBot(pref)
	if err != nil {
		log.Fatal(err)
	}

	Bot.Handle(telebot.OnText, handleText)
	Bot.Handle(telebot.OnCallback, handleCallback)
	Bot.Handle("/start", handleStart)
	Bot.Handle("/today", handleToday)
	Bot.Handle("/month", handleMonth)
	Bot.Handle("/help", handleHelp)

	go func() {
		Bot.Start()
	}()
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
		return c.Send("You have no categories! Please visit the web dashboard to create some first.")
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

	return c.Send(fmt.Sprintf("💰 $%.2f - What was this for?", amount), markup)
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

	_, err = Bot.Edit(callback.Message, fmt.Sprintf("✅ Logged $%.2f under %s %s", amount, cat.Emoji, cat.Name))
	if err != nil {
		log.Printf("Failed to edit message: %v", err)
	}

	return c.Respond(&telebot.CallbackResponse{Text: "Expense logged!"})
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

func handleStart(c telebot.Context) error {
	user := ensureUser(c.Sender())
	if user.ID == 0 {
		return c.Send("Could not create an account for you. Please try again.")
	}
	return c.Send(fmt.Sprintf("Welcome, %s! 👋\n\nTo log an expense, just send me an amount (e.g., `12.50`).", user.Name))
}

func handleToday(c telebot.Context) error {
	user := ensureUser(c.Sender())
	if user.ID == 0 {
		return c.Send("Could not find your account.")
	}

	total, err := Queries.GetTotalExpensesForToday(context.Background(), user.ID)
	if err != nil {
		log.Printf("Error getting today's total: %v", err)
		return c.Send("Could not retrieve today's total.")
	}

	return c.Send(fmt.Sprintf("📊 Today's total: $%.2f", total.(float64)))
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

	return c.Send(fmt.Sprintf("🗓️ This month's total: $%.2f", total.(float64)))
}

func handleHelp(c telebot.Context) error {
	helpText := `
📖 *Help*

• *Log Expense*: Just send a number (e.g., ` + "`15.99`" + ` or ` + "`7`" + `).
• */today*: See your total spending for today.
• */month*: See your total spending for the current month.
• *Configuration*: Visit the web dashboard to add/edit expense categories.
	`
	return c.Send(helpText, &telebot.SendOptions{ParseMode: "Markdown"})
}
