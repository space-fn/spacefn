import { beforeAll, expect, test } from "vitest";

import { analyzeQuery, type ScratchDb } from "../../src/sql/infer.ts";
import { scratchDatabase } from "../../src/sql/node/scratch.ts";

let scratch: ScratchDb;
beforeAll(async () => {
	scratch = await scratchDatabase([
		{ id: "0001", sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL);" },
	]);
});

test("binds named parameters and keeps their order and declared types", async () => {
	const query = await analyzeQuery(
		scratch,
		"q.sql",
		"-- name: byEmail :one\n-- @param email string\nSELECT id, email FROM users WHERE email = :email OR :email = ''",
	);
	expect(query).toMatchObject({
		name: "byEmail",
		mode: "one",
		boundSql: "SELECT id, email FROM users WHERE email = ? OR ? = ''",
		paramNames: ["email", "email"],
		paramTypes: { email: "string" },
		columns: [
			{ name: "id", type: "number", nullable: false },
			{ name: "email", type: "string", nullable: false },
		],
	});
});

test("checks the query with every conditional part excluded too", async () => {
	const query = await analyzeQuery(
		scratch,
		"q.sql",
		"-- name: list :many\n-- @param id number\nSELECT id FROM users\n-- case\n-- when id\nWHERE id = :id\n-- end\nORDER BY id",
	);
	expect(query.parts.map((p) => p.gate)).toEqual([null, ["id"], null]);
	expect(query.parts[1]).toMatchObject({ sql: "WHERE id = ?", paramNames: ["id"] });
});

test("a base query that is invalid without its conditional parts is refused", async () => {
	await expect(
		analyzeQuery(
			scratch,
			"q.sql",
			"-- name: broken :many\n-- @param id number\nSELECT id FROM users WHERE\n-- case\n-- when id\nid = :id\n-- end",
		),
	).rejects.toMatchObject({ code: "QUERY_INVALID" });
});

test("every failure carries a stable code and the query file", async () => {
	await expect(
		analyzeQuery(scratch, "missing.sql", "-- name: missing :one\nSELECT nope FROM users"),
	).rejects.toMatchObject({ code: "QUERY_INVALID", file: "missing.sql" });
	await expect(
		analyzeQuery(scratch, "expr.sql", "-- name: expr :one\nSELECT count(*) AS n FROM users"),
	).rejects.toMatchObject({ code: "INFER_EXPR", file: "expr.sql" });
});
