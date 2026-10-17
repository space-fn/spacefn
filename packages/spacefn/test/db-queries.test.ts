import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vitest";

import type { Migration } from "../src/db";
import { buildQueries } from "../src/db/build-queries";
import { namedParams } from "../src/db/params";
import { sync } from "../src/sync";

const migrations: Migration[] = [
	{
		id: "0001_init",
		sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, bio TEXT); CREATE TABLE todos (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0);",
	},
];

test("rewrites named parameters and remembers their order", () => {
	expect(namedParams("SELECT * FROM t WHERE a = :id AND b = :name AND c = :id")).toEqual({
		sql: "SELECT * FROM t WHERE a = ? AND b = ? AND c = ?",
		names: ["id", "name", "id"],
	});
});

test("leaves placeholders inside strings and comments alone", () => {
	const result = namedParams("SELECT ':not', \"x:y\" -- :comment\nFROM t WHERE a = :id");
	expect(result.names).toEqual(["id"]);
	expect(result.sql).toContain("':not'");
	expect(result.sql).toContain("-- :comment");
});

test("refuses positional parameters", () => {
	expect(() => namedParams("SELECT * FROM t WHERE id = ?")).toThrow("Use named parameters");
});

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "space-queries-"));
	await mkdir(join(dir, "queries"));
});

afterEach(() => rm(dir, { recursive: true, force: true }));

async function query(name: string, body: string) {
	await writeFile(join(dir, "queries", `${name}.sql`), body);
}

test("generates a typed one-row function with a named parameter", async () => {
	await query("find", "-- name: findUser :one\nSELECT id, email, bio FROM users WHERE id = :id");
	const source = await buildQueries(join(dir, "queries"), migrations);
	expect(source).toContain(
		"export interface FindUserRow {\n\tid: number;\n\temail: string;\n\tbio: string | null;\n}",
	);
	expect(source).toContain(
		"export async function findUser(db: D1Reader, params: { id: SqlValue }): Promise<FindUserRow | undefined>",
	);
	expect(source).toContain(
		'queryD1<FindUserRow>(db, "SELECT id, email, bio FROM users WHERE id = ?", [params.id])',
	);
});

test("uses @param types, and returns arrays for :many", async () => {
	await query(
		"list",
		"-- name: listTodos :many\n-- @param owner number\nSELECT id, title, done FROM todos WHERE user_id = :owner ORDER BY id",
	);
	const source = await buildQueries(join(dir, "queries"), migrations);
	expect(source).toContain("params: { owner: number }");
	expect(source).toContain("Promise<ListTodosRow[]>");
	expect(source).toContain("done: number;");
});

test(":exec returns nothing and has no row type", async () => {
	await query("touch", "-- name: markDone :exec\nUPDATE todos SET done = 1 WHERE id = :id");
	const source = await buildQueries(join(dir, "queries"), migrations);
	expect(source).toContain(
		"export async function markDone(db: D1Reader, params: { id: SqlValue }): Promise<void>",
	);
	expect(source).not.toContain("MarkDoneRow");
});

test("a repeated parameter is bound once per use, in order", async () => {
	await query(
		"both",
		"-- name: byEither :many\nSELECT id FROM todos WHERE id = :x OR user_id = :x",
	);
	const source = await buildQueries(join(dir, "queries"), migrations);
	expect(source).toContain("[params.x, params.x]");
	expect(source).toContain("params: { x: SqlValue }");
});

test("a query that does not match the schema stops generation", async () => {
	await query("bad", "-- name: bad :many\nSELECT nope FROM todos");
	await expect(buildQueries(join(dir, "queries"), migrations)).rejects.toThrow(/no such column/);
});

test("two files cannot define the same function name", async () => {
	await query("a", "-- name: same :many\nSELECT id FROM todos");
	await query("b", "-- name: same :many\nSELECT id FROM users");
	await expect(buildQueries(join(dir, "queries"), migrations)).rejects.toThrow("used by two files");
});

test("sync writes .space/queries.ts from db/queries", async () => {
	const root = await mkdtemp(join(tmpdir(), "space-sync-q-"));
	try {
		await mkdir(join(root, "app", "db", "main_db", "migrations"), { recursive: true });
		await mkdir(join(root, "app", "db", "main_db", "queries"), { recursive: true });
		await writeFile(
			join(root, "app", "db", "main_db", "migrations", "0001_init.sql"),
			migrations[0]?.sql ?? "",
		);
		await writeFile(
			join(root, "app", "db", "main_db", "queries", "find.sql"),
			"-- name: findUser :one\nSELECT id FROM users WHERE id = :id",
		);
		await sync(root, "dev");
		expect(await readFile(join(root, ".space", "db", "main_db.ts"), "utf8")).toContain(
			"export async function findUser",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
