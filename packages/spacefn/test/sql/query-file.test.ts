import { expect, test } from "vitest";

import { inferMode, parseQueryFile, queryName } from "../../src/sql/query-file.ts";

test("takes the name from the file, and reads the mode, annotations and SQL", () => {
	const query = parseQueryFile(
		"queries/find-todo.sql",
		"-- :one\n-- @param id number\n-- @column done boolean\nSELECT id, done FROM todos WHERE id = :id",
	);
	expect(query).toMatchObject({
		name: "findTodo",
		mode: "one",
		sql: "SELECT id, done FROM todos WHERE id = :id",
		params: { id: "number" },
		columns: { done: "boolean" },
	});
});

test("names a query in camelCase from its file name", () => {
	expect(
		["add-todo.sql", "add_todo.sql", "addTodo.sql", "/app/db/main/queries/add-todo.sql"].map(
			queryName,
		),
	).toEqual(["addTodo", "addTodo", "addTodo", "addTodo"]);
	expect(queryName("list-v2-items.sql")).toBe("listV2Items");
	for (const bad of ["Add.sql", "1-add.sql", "add--todo.sql", "add todo.sql", "add-.sql"])
		expect(() => queryName(bad)).toThrow("doesn't give a function name");
});

test("reads the mode from the statement unless the file sets it", () => {
	expect(inferMode("SELECT 1")).toBe("many");
	expect(inferMode("  values (1)")).toBe("many");
	expect(inferMode("-- a comment\n/* and another */ select 1")).toBe("many");
	expect(inferMode("WITH t AS (SELECT 1) SELECT * FROM t")).toBe("many");
	expect(inferMode("INSERT INTO t (a) VALUES (1)")).toBe("exec");
	expect(inferMode("UPDATE t SET a = 1")).toBe("exec");
	expect(inferMode("DELETE FROM t")).toBe("exec");
	expect(inferMode("WITH old AS (SELECT 1) DELETE FROM t")).toBe("exec");
	expect(inferMode("INSERT INTO t (a) VALUES (1) RETURNING id")).toBe("many");
	expect(parseQueryFile("q.sql", "INSERT INTO t (a) VALUES (1)").mode).toBe("exec");
	expect(parseQueryFile("q.sql", "-- :one\nINSERT INTO t (a) VALUES (1) RETURNING id").mode).toBe(
		"one",
	);
	expect(parseQueryFile("q.sql", "-- :exec\nSELECT 1").mode).toBe("exec");
	expect(() => parseQueryFile("q.sql", "-- :one\n-- :many\nSELECT 1")).toThrow(
		"sets its mode 2 times",
	);
});

test("points an old -- name: header at the file name", () => {
	expect(() => parseQueryFile("q.sql", "-- name: findTodo :one\nSELECT 1")).toThrow(
		"the query's name comes from its file name now",
	);
});

test("splits -- case blocks into gated parts", () => {
	const query = parseQueryFile(
		"q.sql",
		[
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
	expect(() => parseQueryFile("q.sql", "SELECT 1\n-- case\n-- when nope\nAND 1\n-- end")).toThrow(
		'undeclared param "nope"',
	);
});

test("a file holds one statement", () => {
	expect(() => parseQueryFile("q.sql", "DELETE FROM t;\nSELECT 1;")).toThrow(
		"more than one statement",
	);
	expect(parseQueryFile("q.sql", "-- :one\nSELECT ';' AS semi;\n").sql).toBe("SELECT ';' AS semi;");
});
