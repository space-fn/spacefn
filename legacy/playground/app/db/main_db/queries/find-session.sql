-- name: findSession :one
-- @param tokenHash string
SELECT u.id AS userId, u.email AS email, s.expires_at AS expiresAt, s.last_seen_at AS lastSeenAt
FROM sessions s JOIN users u ON u.id = s.user_id
WHERE s.token_hash = :tokenHash;
