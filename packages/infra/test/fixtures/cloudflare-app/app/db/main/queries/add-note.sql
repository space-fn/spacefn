-- name: addNote :exec
INSERT INTO notes (text) VALUES (:text);
