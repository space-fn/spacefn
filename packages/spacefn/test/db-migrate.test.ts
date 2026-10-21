import { DatabaseSync } from "node:sqlite";

import { expect, test } from "vite-plus/test";

import {
	applyMigrations,
	checksum,
	MigrationError,
	rollbackMigrations,
	type Migration,
	type MigrationExecutor,
	type MigrationStatement,
} from "../src/db";

/** Adapter over node:sqlite, the same shape a D1 or Durable Object adapter provides. */
function sqlite() {
	const db = new DatabaseSync(":memory:");
	const executor: MigrationExecutor = {
		query: async <T>(sql: string, params: unknown[] = []) =>
			db.prepare(sql).all(...(params as never[])) as T[],
		transaction: async (statements) => {
			db.exec("BEGIN");
			try {
				for (const statement of statements) {
					if (typeof statement === "string") db.exec(statement);
					else db.prepare(statement.sql).run(...(statement.params as never[]));
				}
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

const step1: Migration = {
	id: "0010_create",
	sql: "CREATE TABLE r (id INTEGER PRIMARY KEY);",
	down: "DROP TABLE r;",
};
const step2: Migration = {
	id: "0011_seed",
	sql: "INSERT INTO r (id) VALUES (1);",
	down: "DELETE FROM r WHERE id = 1;",
};

test("rolls back one step by default", async () => {
	const { db, executor } = sqlite();
	await applyMigrations(executor, [step1, step2]);
	const rolled = await rollbackMigrations(executor, [step1, step2]);
	expect(rolled).toEqual(["0011_seed"]);
	expect(db.prepare("SELECT id FROM space_migrations ORDER BY id").all()).toEqual([
		{ id: "0010_create" },
	]);
	expect(db.prepare("SELECT id FROM r").all()).toEqual([]);
});

test("rolls back the number of steps asked for, newest first", async () => {
	const { db, executor } = sqlite();
	await applyMigrations(executor, [step1, step2]);
	const rolled = await rollbackMigrations(executor, [step1, step2], { steps: 2 });
	expect(rolled).toEqual(["0011_seed", "0010_create"]);
	expect(db.prepare("SELECT id FROM space_migrations").all()).toEqual([]);
	expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'r'").all()).toEqual([]);
});

test("refuses to roll back a migration with no down section, and rolls back nothing", async () => {
	const { db, executor } = sqlite();
	const noDown: Migration = { id: "0012_plain", sql: "INSERT INTO r (id) VALUES (2);" };
	await applyMigrations(executor, [step1, step2, noDown]);
	await expect(rollbackMigrations(executor, [step1, step2, noDown])).rejects.toThrow(
		/no down section/,
	);
	// The whole rollback is refused, so the ledger and the schema still agree.
	expect(db.prepare("SELECT id FROM space_migrations ORDER BY id").all()).toHaveLength(3);
	expect(db.prepare("SELECT id FROM r ORDER BY id").all()).toEqual([{ id: 1 }, { id: 2 }]);
});

test("refuses to roll back a migration that changed after it was applied", async () => {
	const { executor } = sqlite();
	await applyMigrations(executor, [step1]);
	const edited = { ...step1, sql: "CREATE TABLE r (id INTEGER PRIMARY KEY, extra TEXT);" };
	await expect(rollbackMigrations(executor, [edited])).rejects.toThrow(
		/changed after it was applied/,
	);
});

test("refuses step counts that make no sense", async () => {
	const { executor } = sqlite();
	await expect(rollbackMigrations(executor, [step1], { steps: 0 })).rejects.toThrow(MigrationError);
	await expect(rollbackMigrations(executor, [step1], { steps: -1 })).rejects.toThrow(
		MigrationError,
	);
});

/** Records every statement instead of running it. */
function recording(rows: { id: string; checksum: string }[]) {
	const statements: MigrationStatement[] = [];
	const executor: MigrationExecutor = {
		query: async <T>() => rows as T[],
		transaction: async (batch) => {
			statements.push(...batch);
		},
	};
	return { executor, statements };
}

test("binds the ledger insert on apply and the ledger delete on rollback", async () => {
	const sum = await checksum(step1.sql);
	const applied = recording([]);
	await applyMigrations(applied.executor, [step1]);
	const insert = applied.statements.find(
		(s): s is Extract<MigrationStatement, object> =>
			typeof s !== "string" && s.sql.includes("INSERT"),
	);
	expect(insert?.sql).toContain("VALUES (?, ?");
	expect(insert?.params?.[0]).toBe("0010_create");
	expect(insert?.params?.[1]).toBe(sum);

	const rolled = recording([{ id: "0010_create", checksum: sum }]);
	await rollbackMigrations(rolled.executor, [step1]);
	const del = rolled.statements.find(
		(s): s is Extract<MigrationStatement, object> =>
			typeof s !== "string" && s.sql.includes("DELETE"),
	);
	expect(del).toEqual({
		sql: "DELETE FROM space_migrations WHERE id = ?",
		params: ["0010_create"],
	});
});
