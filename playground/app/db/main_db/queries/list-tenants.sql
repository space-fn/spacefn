-- name: listTenants :many
SELECT slug, internal_id AS internalId, status, deleted_at AS deletedAt FROM tenants ORDER BY slug;
