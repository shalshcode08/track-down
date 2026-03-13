package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"track-down-api/internal/db"

	"github.com/golang-jwt/jwt/v5"
)

var queries *db.Queries
var botToken string
var jwtSecret []byte

type Claims struct {
	UserID int64 `json:"user_id"`
	jwt.RegisteredClaims
}

func Setup(mux *http.ServeMux, q *db.Queries, token string) {
	queries = q
	botToken = token
	jwtSecret = []byte(botToken) // Re-using bot token for JWT secret for simplicity

	mux.HandleFunc("/api/auth/telegram", handleTelegramAuth)
	mux.Handle("/api/me", authMiddleware(http.HandlerFunc(handleMe)))
	mux.Handle("/api/categories", authMiddleware(http.HandlerFunc(handleCategories)))
	mux.Handle("/api/expenses", authMiddleware(http.HandlerFunc(handleExpenses)))
}

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie("token")
		if err != nil {
			if err == http.ErrNoCookie {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		tokenStr := c.Value
		claims := &Claims{}

		token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
			return jwtSecret, nil
		})

		if err != nil {
			if err == jwt.ErrSignatureInvalid {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		if !token.Valid {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), "userID", claims.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("userID").(int64)
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

	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID: user.ID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:    "token",
		Value:   tokenString,
		Expires: expirationTime,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":   user.ID,
		"name": user.Name,
	})
}

func validateTelegramHash(data map[string]interface{}) bool {
	checkHash := data["hash"].(string)
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
	userID := r.Context().Value("userID").(int64)
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		categories, err := queries.ListCategoriesForUser(r.Context(), userID)
		if err != nil {
			http.Error(w, "Failed to get categories", http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(categories)
	case "POST":
		var params db.CreateCategoryParams
		if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		params.UserID = userID
		category, err := queries.CreateCategory(r.Context(), params)
		if err != nil {
			http.Error(w, "Failed to create category", http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(category)
	case "DELETE":
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
	userID := r.Context().Value("userID").(int64)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "GET" {
		start := r.URL.Query().Get("start")
		end := r.URL.Query().Get("end")
		if start == "" || end == "" {
			http.Error(w, "Missing start or end date", http.StatusBadRequest)
			return
		}

		expenses, err := queries.GetExpensesForUserByDateRange(r.Context(), db.GetExpensesForUserByDateRangeParams{
			UserID: userID,
			Date:   start,
			Date_2: end,
		})
		if err != nil {
			http.Error(w, "Failed to get expenses", http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(expenses)
	} else {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
