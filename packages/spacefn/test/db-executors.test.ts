import { DatabaseSync } from "node:sqlite";

import { afterEach, expect, test } from "vitest";

import { d1Executor, durableObjectExecutor, runMigrations, type Migration } from "../src/db";
import { setTracer, type SpanRecord } from "../src/trace";

const records: SpanRecord[] = [];

afterEach(() => {
	setTracer(undefined);
	records.length = 0;
});

/** A D1-shaped database over node:sqlite, enough for the executor. */
function fakeD1(db: DatabaseSync) {
	return {
		prepare: (sql: string) => ({
			bind: (...values: unknown[]) => ({
				all: async <T>() => ({ results: db.prepare(sql).all(...(values as never[])) as T[] }),
				sql,
				values,
			}),
		}),
		batch: async (statements: unknown[]) => {
			db.exec("BEGIN");
			try {
				for (const statement of statements as { sql: string }[]) db.exec(statement.sql);
				db.exec("COMMIT");
			} catch (error) {
				db.exec("ROLLBACK");
				throw error;
			}
			return [];
		},
	};
}

/** The shape of a Durable Object's SQLite storage, over node:sqlite. */
function fakeStorage(db: DatabaseSync) {
	return {
		sql: {
			// Like the real storage, runs the statement as soon as it is called.
			exec: (sql: string, ...params: unknown[]) => {
				const rows = db.prepare(sql).all(...(params as never[]));
				return { toArray: () => rows };
			},
		},
		deleteAll: async () => {
			for (const { name } of db
				.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
				.all() as { name: string }[]) {
				db.exec(`DROP TABLE "${name}"`);
			}
		},
		transactionSync: <T>(fn: () => T): T => {
			db.exec("BEGIN");
			try {
				const result = fn();
				db.exec("COMMIT");
				return result;
			} catch (error) {
				db.exec("ROLLBACK");
				throw error;
			}
		},
	};
}

const migrations: Migration[] = [
	{ id: "0001_todos", sql: "CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT);" },
	{ id: "0002_done", sql: "ALTER TABLE todos ADD COLUMN done INTEGER NOT NULL DEFAULT 0;" },
];

test("D1 executor applies migrations through batch", async () => {
	const db = new DatabaseSync(":memory:");
	expect(await runMigrations(d1Executor(fakeD1(db)), migrations)).toEqual([
		"0001_todos",
		"0002_done",
	]);
	expect(
		db
			.prepare("PRAGMA table_info(todos)")
			.all()
			.map((c) => c.name),
	).toEqual(["id", "title", "done"]);
});

test("Durable Object executor applies migrations inside transactionSync", async () => {
	const db = new DatabaseSync(":memory:");
	expect(await runMigrations(durableObjectExecutor(fakeStorage(db)), migrations)).toEqual([
		"0001_todos",
		"0002_done",
	]);
	expect(await runMigrations(durableObjectExecutor(fakeStorage(db)), migrations)).toEqual([]);
});

test("a migration span reports how many ran", async () => {
	setTracer({ onEnd: (record) => records.push(record) });
	const db = new DatabaseSync(":memory:");
	await runMigrations(durableObjectExecutor(fakeStorage(db)), migrations);
	expect(records[0]).toMatchObject({
		name: "db.migrate",
		attributes: { "db.migrations.total": 2, "db.migrations.applied": 2 },
	});
});
