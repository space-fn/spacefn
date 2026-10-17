-- name: setActive :exec
-- @param slug string
UPDATE tenants SET status = 'active', deleted_at = NULL WHERE slug = :slug;
