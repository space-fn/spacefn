-- name: listTodos :many
-- @column done boolean
SELECT id, title, done FROM todos ORDER BY id;
