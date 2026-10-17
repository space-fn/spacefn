-- name: findUser :one
-- @param email string
SELECT id, email, password_hash AS passwordHash FROM users WHERE email = :email;
