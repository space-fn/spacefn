-- name: addSession :exec
-- @param tokenHash string
-- @param userId number
-- @param expiresAt number
-- @param lastSeenAt number
INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at) VALUES (:tokenHash, :userId, :expiresAt, :lastSeenAt);
