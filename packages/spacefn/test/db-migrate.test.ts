import { DatabaseSync } from "node:sqlite";

import { expect, test } from "vitest";

import { applyMigrations, MigrationError, type Migration, type MigrationExecutor } from "../src/db";

/** Adapter over node:sqlite, the same shape a D1 or Durable Object adapter provides. */
function sqlite() {
	const db = new DatabaseSync(":memory:");
	const executor: MigrationExecutor = {
		query: async <T>(sql: string, params: unknown[] = []) =>
			db.prepare(sql).all(...(params as never[])) as T[],
		transaction: async (statements) => {
			db.exec("BEGIN");
			try {
				for (const statement of statements) db.exec(statement);
				db.exec("COMMIT");
			} catch (error) {
				db.exec("ROLLBACK");
				throw error;
			}
		},
	};
	return { db, executor };
}

const first: Migration = {
	id: "0001_todos",
	sql: "CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT NOT NULL);",
};
const second: Migration = {
	id: "0002_done",
	sql: "ALTER TABLE todos ADD COLUMN done INTEGER NOT NULL DEFAULT 0;",
};

test("applies pending migrations in order and records them", async () => {
	const { db, executor } = sqlite();
	expect(await applyMigrations(executor, [first, second])).toEqual(["0001_todos", "0002_done"]);
	const columns = db
		.prepare("PRAGMA table_info(todos)")
		.all()
		.map((c) => c.name);
	expect(columns).toEqual(["id", "title", "done"]);
	expect(db.prepare("SELECT id FROM space_migrations ORDER BY id").all()).toEqual([
		{ id: "0001_todos" },
		{ id: "0002_done" },
	]);
});

test("applies only what is new on a later run", async () => {
	const { executor } = sqlite();
	await applyMigrations(executor, [first]);
	expect(await applyMigrations(executor, [first, second])).toEqual(["0002_done"]);
	expect(await applyMigrations(executor, [first, second])).toEqual([]);
});

test("refuses a migration whose file changed after it was applied", async () => {
	const { executor } = sqlite();
	await applyMigrations(executor, [first]);
	const edited = { ...first, sql: "CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT);" };
	await expect(applyMigrations(executor, [edited])).rejects.toThrow(MigrationError);
	await expect(applyMigrations(executor, [edited])).rejects.toThrow("changed after it was applied");
});

test("a failing migration leaves nothing behind, including its ledger row", async () => {
	const { db, executor } = sqlite();
	const broken: Migration = {
		id: "0001_broken",
		sql: "CREATE TABLE half (id INTEGER); INSERT INTO missing_table VALUES (1);",
	};
	await expect(applyMigrations(executor, [broken])).rejects.toThrow();
	expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'half'").all()).toEqual([]);
	expect(db.prepare("SELECT id FROM space_migrations").all()).toEqual([]);
});

test("records a checksum for each migration", async () => {
	const { db, executor } = sqlite();
	await applyMigrations(executor, [first]);
	const [row] = db.prepare("SELECT checksum FROM space_migrations").all() as { checksum: string }[];
	expect(row?.checksum).toMatch(/^[0-9a-f]{64}$/);
});

test("rejects migration names that are unsafe to store", async () => {
	const { executor } = sqlite();
	await expect(
		applyMigrations(executor, [{ id: "x'); DROP TABLE t; --", sql: "SELECT 1" }]),
	).rejects.toThrow("may only use letters");
});
