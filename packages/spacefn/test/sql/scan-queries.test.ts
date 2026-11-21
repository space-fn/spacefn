import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vitest";

import { scanQueries } from "../../src/sql/node/scan.ts";

const migrations = [
	{ id: "0001", sql: "CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT NOT NULL);" },
];
let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "spacefn-sql-"));
	await mkdir(dir, { recursive: true });
});
afterEach(() => rm(dir, { recursive: true, force: true }));

test("reads every query in name order and skips drafts", async () => {
	await writeFile(join(dir, "b.sql"), "SELECT id FROM todos");
	await writeFile(join(dir, "a.sql"), "-- :one\nSELECT title FROM todos");
	await writeFile(join(dir, "_wip.sql"), "not a query");
	expect((await scanQueries(dir, migrations)).map((q) => q.name)).toEqual(["a", "b"]);
});

test("names the queries in a folder after it, skipping draft folders", async () => {
	await mkdir(join(dir, "todo-items", "stats"), { recursive: true });
	await mkdir(join(dir, "_drafts"));
	await writeFile(join(dir, "todo-items", "mark-done.sql"), "UPDATE todos SET title = 'x'");
	await writeFile(join(dir, "todo-items", "stats", "count.sql"), "SELECT id FROM todos");
	await writeFile(join(dir, "_drafts", "nope.sql"), "not a query");
	await writeFile(join(dir, "list.sql"), "SELECT id FROM todos");
	expect((await scanQueries(dir, migrations)).map((q) => q.name)).toEqual([
		"list",
		"todoItems.markDone",
		"todoItems.stats.count",
	]);
});

test("a query and a folder cannot share a name", async () => {
	await mkdir(join(dir, "todos"));
	await writeFile(join(dir, "todos.sql"), "SELECT id FROM todos");
	await writeFile(join(dir, "todos", "list.sql"), "SELECT id FROM todos");
	await expect(scanQueries(dir, migrations)).rejects.toMatchObject({
		code: "QUERY_DUP",
		message: "todos is given by both todos/list.sql and todos.sql",
	});
});

test("a folder must give a namespace name", async () => {
	await mkdir(join(dir, "Todos"));
	await writeFile(join(dir, "Todos", "list.sql"), "SELECT id FROM todos");
	await expect(scanQueries(dir, migrations)).rejects.toMatchObject({ code: "QUERY_NAME" });
});

test("returns nothing without a queries folder", async () => {
	expect(await scanQueries(join(dir, "nope"), migrations)).toEqual([]);
});

test("two files cannot give the same function name", async () => {
	await writeFile(join(dir, "list-todos.sql"), "SELECT id FROM todos");
	await writeFile(join(dir, "list_todos.sql"), "SELECT id FROM todos");
	await expect(scanQueries(dir, migrations)).rejects.toMatchObject({ code: "QUERY_DUP" });
});

test("a query that does not match the schema fails with the database's message", async () => {
	await writeFile(join(dir, "a.sql"), "SELECT nope FROM todos");
	await expect(scanQueries(dir, migrations)).rejects.toThrow(/no such column/);
});
