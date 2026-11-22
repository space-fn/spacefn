-- up
CREATE TABLE products (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL,
	-- In cents.
	price INTEGER NOT NULL,
	stock INTEGER NOT NULL DEFAULT 0
);

-- down
DROP TABLE products;
