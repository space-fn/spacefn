-- :one
-- @param slug string
SELECT slug, name, url FROM shops WHERE slug = :slug;
