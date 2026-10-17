-- name: deleteSession :exec
-- @param tokenHash string
DELETE FROM sessions WHERE token_hash = :tokenHash;
