-- name: listTodos :many
SELECT id, title, done FROM todos ORDER BY id;
