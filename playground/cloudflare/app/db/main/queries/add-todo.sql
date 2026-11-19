-- name: addTodo :exec
INSERT INTO todos (title) VALUES (:title);
