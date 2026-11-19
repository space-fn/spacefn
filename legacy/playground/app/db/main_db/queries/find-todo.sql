-- name: findTodo :one
-- @param id number
SELECT id, title, done FROM todos WHERE id = :id;
