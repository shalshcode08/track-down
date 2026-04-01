package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
	"track-down-api/bot"
	"track-down-api/handlers"
	"track-down-api/internal/db"

	"github.com/joho/godotenv"
)

// responseWriter wraps http.ResponseWriter to capture the status code for logging.
type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(status int) {
	rw.status = status
	rw.ResponseWriter.WriteHeader(status)
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		duration := time.Since(start)
		log.Printf("%-6s %-40s %d  %s", r.Method, r.URL.RequestURI(), rw.status, duration.Round(time.Microsecond))
	})
}

func corsMiddleware(origin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lmsgprefix)
	log.SetPrefix("  ")

	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./track-down.db"
	}

	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()
	log.Printf("Database opened: %s", dbPath)

	queries := db.New(database)

	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	if botToken == "" {
		log.Fatal("TELEGRAM_BOT_TOKEN is required")
	}

	if err := bot.Start(queries, botToken); err != nil {
		log.Printf("WARNING: Telegram bot failed to start: %v", err)
		log.Println("HTTP server will still run, but bot features are unavailable.")
	} else {
		log.Println("Telegram bot started")
	}

	mux := http.NewServeMux()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	allowedOrigin := os.Getenv("ALLOWED_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "http://localhost:5173"
	}

	secure := strings.HasPrefix(allowedOrigin, "https://")
	handlers.Setup(mux, queries, botToken, secure)

	// Print registered routes at startup
	routes := []string{
		"POST   /api/auth/code",
		"POST   /api/auth/telegram",
		"GET    /api/me",
		"GET    /api/categories",
		"POST   /api/categories",
		"DELETE /api/categories?id=",
		"GET    /api/expenses?start=&end=",
		"POST   /api/expenses",
		"DELETE /api/expenses?id=",
	}
	fmt.Println()
	log.Printf("Registered routes:")
	for _, r := range routes {
		log.Printf("  %s", r)
	}
	fmt.Println()

	server := &http.Server{
		Addr:    ":" + port,
		Handler: loggingMiddleware(corsMiddleware(allowedOrigin, mux)),
	}

	go func() {
		log.Printf("Server listening on http://localhost:%s", port)
		log.Printf("CORS allowed origin: %s", allowedOrigin)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}
	log.Println("Server stopped")
}
