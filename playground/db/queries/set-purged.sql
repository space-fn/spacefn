-- name: setPurged :exec
-- @param slug string
UPDATE tenants SET status = 'purged' WHERE slug = :slug;
