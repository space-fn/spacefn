-- name: addTenant :exec
-- @param slug string
-- @param internalId string
INSERT INTO tenants (slug, internal_id) VALUES (:slug, :internalId);
