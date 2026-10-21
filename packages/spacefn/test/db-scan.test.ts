import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { generateMigrationsSource } from "../src/db";
import { scanMigrations } from "../src/db/scan";
import { sync } from "../src/sync";

let root: string;
let dir: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "space-db-"));
	dir = join(root, "app", "db", "main_db", "migrations");
	await mkdir(dir, { recursive: true });
	await mkdir(join(root, "app"), { recursive: true });
});

afterEach(() => rm(root, { recursive: true, force: true }));

test("reads migrations in numeric order and ignores other files", async () => {
	await writeFile(join(dir, "0002_done.sql"), "-- up\nALTER TABLE t ADD c;");
	await writeFile(join(dir, "0001_create.sql"), "-- up\nCREATE TABLE t (id);");
	await writeFile(join(dir, "notes.md"), "");
	await writeFile(join(dir, "_draft.sql"), "");
	expect(await scanMigrations(dir)).toEqual([
		{ id: "0001_create", sql: "CREATE TABLE t (id);" },
		{ id: "0002_done", sql: "ALTER TABLE t ADD c;" },
	]);
});

test("rejects names without a number", async () => {
	await writeFile(join(dir, "create.sql"), "");
	await expect(scanMigrations(dir)).rejects.toThrow("must be named NNNN_name.sql");
});

test("rejects two migrations with the same number", async () => {
	await writeFile(join(dir, "0001_a.sql"), "");
	await writeFile(join(dir, "0001_b.sql"), "");
	await expect(scanMigrations(dir)).rejects.toThrow("share the number 1");
});

test("returns nothing without a migrations folder", async () => {
	expect(await scanMigrations(join(root, "nope"))).toEqual([]);
});

test("refuses a migration with no -- up section", async () => {
	await writeFile(join(dir, "0001_a.sql"), "CREATE TABLE a (id);");
	await expect(scanMigrations(dir)).rejects.toThrow(/-- up/);
});

test("separates the up and down sections in either order", async () => {
	await writeFile(join(dir, "0001_a.sql"), "-- down\nDROP TABLE a;\n-- up\nCREATE TABLE a;\n");
	await writeFile(join(dir, "0002_b.sql"), "-- up\nCREATE TABLE b;\n-- down\nDROP TABLE b;\n");
	const [first, second] = await scanMigrations(dir);
	expect(first).toEqual({ id: "0001_a", sql: "CREATE TABLE a;", down: "DROP TABLE a;" });
	expect(second).toEqual({ id: "0002_b", sql: "CREATE TABLE b;", down: "DROP TABLE b;" });
});

test("generated source inlines the SQL", () => {
	const source = generateMigrationsSource([{ id: "0001_a", sql: 'CREATE TABLE "x" (y);' }]);
	expect(source).toContain('{ id: "0001_a", sql: "CREATE TABLE \\"x\\" (y);" },');
	expect(source).toContain("export const migrations: Migration[] = [");
});

test("sync writes .space/db/main_db.ts", async () => {
	await writeFile(join(dir, "0001_a.sql"), "-- up\nCREATE TABLE a (id);");
	await sync(root, "dev");
	expect(await readFile(join(root, ".space", "db", "main_db.ts"), "utf8")).toContain(
		'id: "0001_a"',
	);
});
