CREATE TABLE users (
	id INTEGER PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL
);

CREATE TABLE sessions (
	token_hash TEXT PRIMARY KEY NOT NULL,
	user_id INTEGER NOT NULL REFERENCES users (id),
	expires_at INTEGER NOT NULL,
	last_seen_at INTEGER NOT NULL
);
