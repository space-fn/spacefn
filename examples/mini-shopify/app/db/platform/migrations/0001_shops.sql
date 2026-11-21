-- up
CREATE TABLE shops (
	slug TEXT PRIMARY KEY NOT NULL,
	name TEXT NOT NULL,
	-- Where the shop's own database is: libsql://... on Turso, file:... locally.
	url TEXT NOT NULL
);

-- down
DROP TABLE shops;
