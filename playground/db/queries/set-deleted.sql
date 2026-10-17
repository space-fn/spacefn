-- name: setDeleted :exec
-- @param slug string
-- @param at number
UPDATE tenants SET status = 'deleted', deleted_at = :at WHERE slug = :slug;
