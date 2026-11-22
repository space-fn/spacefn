import { SqliteClient } from "@effect/sql-sqlite-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { Reactivity } from "effect/reactivity";
import { SqlClient } from "effect/sql";

import { transactional, type DbConnection } from "../src/db/connection.ts";
import { applyMigrations, LEDGER, migrationStatus, rollbackMigrations } from "../src/db/migrate.ts";

const Sqlite = SqliteClient.layer({ filename: ":memory:" }).pipe(Layer.provide(Reactivity.layer));

const connect = Effect.gen(function* () {
	return transactional(yield* SqlClient.SqlClient);
});

const todos = {
	id: "0001_todos",
	sql: "CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT NOT NULL);",
	down: "DROP TABLE todos;",
};
const notes = {
	id: "0002_notes",
	sql: "ALTER TABLE todos ADD COLUMN note TEXT;\nCREATE INDEX todos_title ON todos (title);",
	down: "DROP INDEX todos_title;\nALTER TABLE todos DROP COLUMN note;",
};

const tables = (db: DbConnection) =>
	db.sql
		.unsafe<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
		.pipe(Effect.map((rows) => rows.map((r) => r.name)));

describe("applyMigrations", () => {
	it.effect("applies pending migrations once, in order", () =>
		Effect.gen(function* () {
			const db = yield* connect;
			expect(yield* applyMigrations(db, [todos, notes])).toEqual(["0001_todos", "0002_notes"]);
			expect(yield* applyMigrations(db, [todos, notes])).toEqual([]);
			expect(yield* tables(db)).toEqual([LEDGER, "todos"]);
		}).pipe(Effect.provide(Sqlite)),
	);

	it.effect("refuses a migration edited after it was applied", () =>
		Effect.gen(function* () {
			const db = yield* connect;
			yield* applyMigrations(db, [todos]);
			const error = yield* Effect.flip(
				applyMigrations(db, [{ ...todos, sql: `${todos.sql}\n-- edited` }]),
			);
			expect(error).toMatchObject({ _tag: "MigrationError", reason: "changed", id: "0001_todos" });
		}).pipe(Effect.provide(Sqlite)),
	);

	it.effect("rolls back a failing migration with its ledger row", () =>
		Effect.gen(function* () {
			const db = yield* connect;
			const broken = { id: "0002_broken", sql: "CREATE TABLE a (x);\nNOT SQL;" };
			const error = yield* Effect.flip(applyMigrations(db, [todos, broken]));
			expect(error._tag).toBe("SqlError");
			expect(yield* tables(db)).toEqual([LEDGER, "todos"]);
			const status = yield* migrationStatus(db, [todos, broken]);
			expect(status.migrations.map((m) => m.state)).toEqual(["applied", "pending"]);
		}).pipe(Effect.provide(Sqlite)),
	);

	it.effect("rejects ids that aren't plain names", () =>
		Effect.gen(function* () {
			const db = yield* connect;
			const error = yield* Effect.flip(applyMigrations(db, [{ id: "1; DROP", sql: "SELECT 1" }]));
			expect(error).toMatchObject({ reason: "invalid-id" });
		}).pipe(Effect.provide(Sqlite)),
	);
});

describe("rollbackMigrations", () => {
	it.effect("undoes the newest migrations, newest first", () =>
		Effect.gen(function* () {
			const db = yield* connect;
			yield* applyMigrations(db, [todos, notes]);
			expect(yield* rollbackMigrations(db, [todos, notes], 2)).toEqual([
				"0002_notes",
				"0001_todos",
			]);
			expect(yield* tables(db)).toEqual([LEDGER]);
			expect(yield* applyMigrations(db, [todos, notes])).toHaveLength(2);
		}).pipe(Effect.provide(Sqlite)),
	);

	it.effect("refuses the whole rollback when one step has no down section", () =>
		Effect.gen(function* () {
			const db = yield* connect;
			const { down: _, ...noDown } = todos;
			yield* applyMigrations(db, [noDown, notes]);
			const error = yield* Effect.flip(rollbackMigrations(db, [noDown, notes], 2));
			expect(error).toMatchObject({ reason: "no-down", id: "0001_todos" });
			const status = yield* migrationStatus(db, [noDown, notes]);
			expect(status.migrations.map((m) => m.state)).toEqual(["applied", "applied"]);
		}).pipe(Effect.provide(Sqlite)),
	);

	it.effect("rejects a step count that isn't a positive integer", () =>
		Effect.gen(function* () {
			const db = yield* connect;
			const error = yield* Effect.flip(rollbackMigrations(db, [todos], 0));
			expect(error).toMatchObject({ reason: "invalid-steps" });
		}).pipe(Effect.provide(Sqlite)),
	);
});

describe("migrationStatus", () => {
	it.effect("reports pending, changed and unknown migrations", () =>
		Effect.gen(function* () {
			const db = yield* connect;
			yield* applyMigrations(db, [todos, notes]);
			const status = yield* migrationStatus(db, [
				{ ...todos, sql: `${todos.sql} -- edited` },
				{ id: "0003_tags", sql: "CREATE TABLE tags (id INTEGER);" },
			]);
			expect(status).toEqual({
				migrations: [
					{ id: "0001_todos", state: "changed" },
					{ id: "0003_tags", state: "pending" },
				],
				unknown: ["0002_notes"],
			});
		}).pipe(Effect.provide(Sqlite)),
	);
});
