-- @param choice string
INSERT INTO votes (choice, n) VALUES (:choice, 1)
ON CONFLICT (choice) DO UPDATE SET n = n + 1;
