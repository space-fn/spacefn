-- name: toggleTodo :exec
UPDATE todos SET done = 1 - done WHERE id = :id;
