-- name: touchSession :exec
-- @param tokenHash string
-- @param lastSeenAt number
UPDATE sessions SET last_seen_at = :lastSeenAt WHERE token_hash = :tokenHash;
