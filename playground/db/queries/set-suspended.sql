-- name: setSuspended :exec
-- @param slug string
UPDATE tenants SET status = 'suspended', deleted_at = NULL WHERE slug = :slug;
