-- name: addUser :exec
-- @param email string
-- @param passwordHash string
INSERT INTO users (email, password_hash) VALUES (:email, :passwordHash);
