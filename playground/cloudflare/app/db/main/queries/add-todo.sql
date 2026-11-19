-- name: addTodo :exec
-- @param title string
INSERT INTO todos (title) VALUES (:title);
