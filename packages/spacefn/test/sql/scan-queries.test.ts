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
