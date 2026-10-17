-- name: findTenant :one
-- @param slug string
SELECT slug, internal_id AS internalId, status FROM tenants WHERE slug = :slug;
