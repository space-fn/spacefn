-- name: findTenant :one
-- @param slug string
SELECT slug, internal_id AS internalId, status, deleted_at AS deletedAt FROM tenants WHERE slug = :slug;
