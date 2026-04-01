package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"track-down-api/bot"
	"track-down-api/internal/db"

	"github.com/golang-jwt/jwt/v5"
)

var queries *db.Queries
var botToken string
var jwtSecret []byte
var secureCookie bool

type Claims struct {
	UserID int64 `json:"user_id"`
	jwt.RegisteredClaims
}

// Response types with proper JSON tags so the frontend gets snake_case primitives.

type categoryResponse struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	Name      string `json:"name"`
	Emoji     string `json:"emoji"`
	SortOrder int64  `json:"sort_order"`
}

type expenseResponse struct {
	ID            int64   `json:"id"`
	UserID        int64   `json:"user_id"`
	CategoryID    int64   `json:"category_id"`
	Amount        float64 `json:"amount"`
	Note          *string `json:"note"`
	CreatedAt     string  `json:"created_at"`
	CategoryName  string  `json:"category_name"`
	CategoryEmoji string  `json:"category_emoji"`
}

func toCategoryResponse(cat db.Category) categoryResponse {
	var sortOrder int64
	if cat.SortOrder.Valid {
		sortOrder = cat.SortOrder.Int64
	}
	return categoryResponse{
		ID:        cat.ID,
		UserID:    cat.UserID,
		Name:      cat.Name,
		Emoji:     cat.Emoji,
		SortOrder: sortOrder,
	}
}

func toExpenseResponse(row db.GetExpensesForUserByDateRangeRow) expenseResponse {
	var note *string
	if row.Note.Valid {
		note = &row.Note.String
	}
	createdAt := ""
	if row.CreatedAt.Valid {
		createdAt = row.CreatedAt.Time.UTC().Format(time.RFC3339)
	}
	return expenseResponse{
		ID:            row.ID,
		UserID:        row.UserID,
		CategoryID:    row.CategoryID,
		Amount:        row.Amount,
		Note:          note,
		CreatedAt:     createdAt,
		CategoryName:  row.CategoryName,
		CategoryEmoji: row.CategoryEmoji,
	}
}

func Setup(mux *http.ServeMux, q *db.Queries, token string, secure bool) {
	queries = q
	botToken = token
	jwtSecret = []byte(botToken)
	secureCookie = secure

	mux.HandleFunc("/api/auth/telegram", handleTelegramAuth)
	mux.HandleFunc("/api/auth/code", handleCodeAuth)
	mux.Handle("/api/me", authMiddleware(http.HandlerFunc(handleMe)))
	mux.Handle("/api/categories", authMiddleware(http.HandlerFunc(handleCategories)))
	mux.Handle("/api/expenses", authMiddleware(http.HandlerFunc(handleExpenses)))
}

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie("token")
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(c.Value, claims, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method")
			}
			return jwtSecret, nil
		})
		if err != nil || !token.Valid {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), contextKey("userID"), claims.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

type contextKey string

func userIDFromCtx(r *http.Request) (int64, bool) {
	v := r.Context().Value(contextKey("userID"))
	id, ok := v.(int64)
	return id, ok
}

func setCookie(w http.ResponseWriter, tokenString string, expiry time.Time) {
	sameSite := http.SameSiteLaxMode
	if secureCookie {
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    tokenString,
		Expires:  expiry,
		HttpOnly: true,
		Secure:   secureCookie,
		SameSite: sameSite,
		Path:     "/",
	})
}

func mintToken(userID int64) (string, time.Time, error) {
	expiry := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiry),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	return tokenString, expiry, err
}

func handleCodeAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Code == "" {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	var user db.User

	// Dev bypass: if DEV_LOGIN_CODE is set and matches, log in as the first user.
	if devCode := os.Getenv("DEV_LOGIN_CODE"); devCode != "" && body.Code == devCode {
		users, err := queries.GetUserByID(r.Context(), 1)
		if err != nil {
			http.Error(w, "No users in database yet", http.StatusUnauthorized)
			return
		}
		user = users
	} else {
		telegramID := bot.RedeemLoginCode(body.Code)
		if telegramID == 0 {
			http.Error(w, "Invalid or expired code", http.StatusUnauthorized)
			return
		}
		var err error
		user, err = queries.GetUserByTelegramID(r.Context(), telegramID)
		if err != nil {
			http.Error(w, "User not found", http.StatusUnauthorized)
			return
		}
	}

	tokenString, expiry, err := mintToken(user.ID)
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	setCookie(w, tokenString, expiry)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":   user.ID,
		"name": user.Name,
	})
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromCtx(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := queries.GetUserByID(r.Context(), userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":   user.ID,
		"name": user.Name,
	})
}

func handleTelegramAuth(w http.ResponseWriter, r *http.Request) {
	var userData map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&userData); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if !validateTelegramHash(userData) {
		http.Error(w, "Invalid hash", http.StatusForbidden)
		return
	}

	telegramID := int64(userData["id"].(float64))
	name := userData["first_name"].(string)

	user, err := queries.CreateUser(r.Context(), db.CreateUserParams{
		TelegramID: telegramID,
		Name:       name,
	})
	if err != nil {
		http.Error(w, "Failed to create or find user", http.StatusInternalServerError)
		return
	}

	tokenString, expiry, err := mintToken(user.ID)
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	setCookie(w, tokenString, expiry)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":   user.ID,
		"name": user.Name,
	})
}

func validateTelegramHash(data map[string]interface{}) bool {
	hashVal, ok := data["hash"]
	if !ok {
		return false
	}
	checkHash, ok := hashVal.(string)
	if !ok {
		return false
	}
	delete(data, "hash")

	var dataCheckArr []string
	for k, v := range data {
		dataCheckArr = append(dataCheckArr, fmt.Sprintf("%s=%v", k, v))
	}
	sort.Strings(dataCheckArr)
	dataCheckString := strings.Join(dataCheckArr, "\n")

	secretKey := sha256.Sum256([]byte(botToken))
	h := hmac.New(sha256.New, secretKey[:])
	h.Write([]byte(dataCheckString))
	hash := hex.EncodeToString(h.Sum(nil))

	return hash == checkHash
}

func handleCategories(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromCtx(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		categories, err := queries.ListCategoriesForUser(r.Context(), userID)
		if err != nil {
			http.Error(w, "Failed to get categories", http.StatusInternalServerError)
			return
		}
		resp := make([]categoryResponse, 0, len(categories))
		for _, cat := range categories {
			resp = append(resp, toCategoryResponse(cat))
		}
		json.NewEncoder(w).Encode(resp)

	case http.MethodPost:
		var body struct {
			Name      string `json:"name"`
			Emoji     string `json:"emoji"`
			SortOrder int64  `json:"sort_order"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(body.Name) == "" {
			http.Error(w, "Name is required", http.StatusBadRequest)
			return
		}
		if body.Emoji == "" {
			body.Emoji = "💰"
		}
		category, err := queries.CreateCategory(r.Context(), db.CreateCategoryParams{
			UserID:    userID,
			Name:      strings.TrimSpace(body.Name),
			Emoji:     body.Emoji,
			SortOrder: sql.NullInt64{Int64: body.SortOrder, Valid: true},
		})
		if err != nil {
			http.Error(w, "Failed to create category", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(toCategoryResponse(category))

	case http.MethodPatch:
		idStr := r.URL.Query().Get("id")
		if idStr == "" {
			http.Error(w, "Missing id", http.StatusBadRequest)
			return
		}
		var id int64
		if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
			http.Error(w, "Invalid id", http.StatusBadRequest)
			return
		}
		var body struct {
			Name  string `json:"name"`
			Emoji string `json:"emoji"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(body.Name) == "" {
			http.Error(w, "Name is required", http.StatusBadRequest)
			return
		}
		if body.Emoji == "" {
			body.Emoji = "💰"
		}
		if err := queries.UpdateCategory(r.Context(), db.UpdateCategoryParams{
			Name:   strings.TrimSpace(body.Name),
			Emoji:  body.Emoji,
			ID:     id,
			UserID: userID,
		}); err != nil {
			http.Error(w, "Failed to update category", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	case http.MethodDelete:
		idStr := r.URL.Query().Get("id")
		if idStr == "" {
			http.Error(w, "Missing id", http.StatusBadRequest)
			return
		}
		var id int64
		if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
			http.Error(w, "Invalid id", http.StatusBadRequest)
			return
		}
		if err := queries.DeleteCategory(r.Context(), db.DeleteCategoryParams{ID: id, UserID: userID}); err != nil {
			http.Error(w, "Failed to delete category", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleExpenses(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromCtx(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		start := r.URL.Query().Get("start")
		end := r.URL.Query().Get("end")
		if start == "" || end == "" {
			http.Error(w, "Missing start or end date", http.StatusBadRequest)
			return
		}

		rows, err := queries.GetExpensesForUserByDateRange(r.Context(), db.GetExpensesForUserByDateRangeParams{
			UserID: userID,
			Date:   start,
			Date_2: end,
		})
		if err != nil {
			http.Error(w, "Failed to get expenses", http.StatusInternalServerError)
			return
		}
		resp := make([]expenseResponse, 0, len(rows))
		for _, row := range rows {
			resp = append(resp, toExpenseResponse(row))
		}
		json.NewEncoder(w).Encode(resp)

	case http.MethodPost:
		var body struct {
			CategoryID int64   `json:"category_id"`
			Amount     float64 `json:"amount"`
			Note       string  `json:"note"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		if body.Amount <= 0 {
			http.Error(w, "Amount must be greater than zero", http.StatusBadRequest)
			return
		}
		if body.CategoryID == 0 {
			http.Error(w, "category_id is required", http.StatusBadRequest)
			return
		}

		var note sql.NullString
		if strings.TrimSpace(body.Note) != "" {
			note = sql.NullString{String: strings.TrimSpace(body.Note), Valid: true}
		}

		expense, err := queries.CreateExpense(r.Context(), db.CreateExpenseParams{
			UserID:     userID,
			CategoryID: body.CategoryID,
			Amount:     body.Amount,
			Note:       note,
		})
		if err != nil {
			http.Error(w, "Failed to create expense", http.StatusInternalServerError)
			return
		}

		cat, err := queries.GetCategoryByID(r.Context(), expense.CategoryID)
		if err != nil {
			http.Error(w, "Failed to fetch category", http.StatusInternalServerError)
			return
		}

		var notePtr *string
		if expense.Note.Valid {
			notePtr = &expense.Note.String
		}
		createdAt := ""
		if expense.CreatedAt.Valid {
			createdAt = expense.CreatedAt.Time.UTC().Format(time.RFC3339)
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(expenseResponse{
			ID:            expense.ID,
			UserID:        expense.UserID,
			CategoryID:    expense.CategoryID,
			Amount:        expense.Amount,
			Note:          notePtr,
			CreatedAt:     createdAt,
			CategoryName:  cat.Name,
			CategoryEmoji: cat.Emoji,
		})

	case http.MethodDelete:
		idStr := r.URL.Query().Get("id")
		if idStr == "" {
			http.Error(w, "Missing id", http.StatusBadRequest)
			return
		}
		var id int64
		if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
			http.Error(w, "Invalid id", http.StatusBadRequest)
			return
		}
		if err := queries.DeleteExpense(r.Context(), db.DeleteExpenseParams{ID: id, UserID: userID}); err != nil {
			http.Error(w, "Failed to delete expense", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
