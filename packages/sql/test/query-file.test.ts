import { expect, test } from "vitest";

import { parseQueryFile } from "../src/query-file";

test("reads the header, annotations and SQL", () => {
	const query = parseQueryFile(
		"q.sql",
		"-- name: findTodo :one\n-- @param id number\n-- @column done boolean\nSELECT id, done FROM todos WHERE id = :id",
	);
	expect(query).toMatchObject({
		name: "findTodo",
		mode: "one",
		sql: "SELECT id, done FROM todos WHERE id = :id",
		params: { id: "number" },
		columns: { done: "boolean" },
	});
});

test("splits -- case blocks into gated parts", () => {
	const query = parseQueryFile(
		"q.sql",
		[
			"-- name: listTodos :many",
			"-- @param done boolean",
			"-- @param q string",
			"SELECT id FROM todos WHERE 1 = 1",
			"-- case",
			"-- when done",
			"AND done = :done",
			"-- when q",
			"AND title LIKE :q",
			"-- end",
			"ORDER BY id",
		].join("\n"),
	);
	expect(query.parts).toEqual([
		{ sql: "SELECT id FROM todos WHERE 1 = 1", gate: null },
		{ sql: "AND done = :done", gate: ["done"] },
		{ sql: "AND title LIKE :q", gate: ["q"] },
		{ sql: "ORDER BY id", gate: null },
	]);
});

test("a gate must name a declared @param", () => {
	expect(() =>
		parseQueryFile("q.sql", "-- name: x :many\nSELECT 1\n-- case\n-- when nope\nAND 1\n-- end"),
	).toThrow('undeclared param "nope"');
});
