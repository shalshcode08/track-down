-- name: CreateUser :one
INSERT INTO users (telegram_id, name)
VALUES (?, ?)
ON CONFLICT(telegram_id) DO UPDATE SET name=excluded.name
RETURNING *;

-- name: GetUserByTelegramID :one
SELECT * FROM users
WHERE telegram_id = ? LIMIT 1;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = ? LIMIT 1;

-- name: UpdateUserConfig :exec
UPDATE users
SET timezone = ?, daily_summary = ?
WHERE id = ?;

-- name: ListUsersForDailySummary :many
SELECT * FROM users
WHERE daily_summary = 1;

-- name: CreateCategory :one
INSERT INTO categories (user_id, name, emoji, sort_order)
VALUES (?, ?, ?, ?)
RETURNING *;

-- name: ListCategoriesForUser :many
SELECT * FROM categories
WHERE user_id = ?
ORDER BY sort_order ASC, id ASC;

-- name: GetCategoryByID :one
SELECT * FROM categories
WHERE id = ? LIMIT 1;

-- name: DeleteCategory :exec
DELETE FROM categories
WHERE id = ? AND user_id = ?;

-- name: CreateExpense :one
INSERT INTO expenses (user_id, category_id, amount, note)
VALUES (?, ?, ?, ?)
RETURNING *;

-- name: GetExpensesForUserByDateRange :many
SELECT e.*, c.name as category_name, c.emoji as category_emoji
FROM expenses e
JOIN categories c ON e.category_id = c.id
WHERE e.user_id = ? AND date(e.created_at) >= date(?) AND date(e.created_at) <= date(?)
ORDER BY e.created_at DESC;

-- name: GetTotalExpensesForUserByDateRange :one
SELECT coalesce(SUM(amount), 0.0) as total
FROM expenses
WHERE user_id = ? AND date(created_at) >= date(?) AND date(created_at) <= date(?);

-- name: GetTotalExpensesForToday :one
SELECT coalesce(SUM(amount), 0.0) as total
FROM expenses
WHERE user_id = ? AND date(created_at, 'localtime') = date('now', 'localtime');
