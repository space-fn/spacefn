-- up
CREATE TABLE votes (
	choice TEXT PRIMARY KEY,
	n INTEGER NOT NULL
);

-- down
DROP TABLE votes;
