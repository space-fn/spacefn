import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";
import type { PlannedDb } from "spacefn/internal/codegen";

import {
	connectFromEnv,
	dbMigrate,
	dbRollback,
	dbStatus,
	formatReport,
	isUnhealthy,
} from "../../src/infra/db.ts";

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "space-db-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const main: PlannedDb = {
	name: "main",
	driver: "libsql",
	migrateOn: "startup",
	binding: "DB_MAIN",
	migrations: [
		{
			id: "0001_todos",
			sql: "CREATE TABLE todos (id INTEGER PRIMARY KEY);",
			down: "DROP TABLE todos;",
		},
		{
			id: "0002_tags",
			sql: "CREATE TABLE tags (id INTEGER PRIMARY KEY);",
			down: "DROP TABLE tags;",
		},
	],
	queries: [],
};
const edge: PlannedDb = { ...main, name: "edge", driver: "d1", binding: "DB_EDGE" };

const env = () =>
	ConfigProvider.layer(ConfigProvider.fromUnknown({ DB_MAIN_URL: `file:${join(dir, "main.db")}` }));

describe("space db", () => {
	it.effect("migrates, reports status and rolls back a libSQL database", () =>
		Effect.gen(function* () {
			const migrated = yield* dbMigrate([main, edge], connectFromEnv);
			expect(migrated.map(formatReport)).toEqual([
				"main:\n  applied 0001_todos\n  applied 0002_tags",
				"edge (d1): the CLI can't reach it; it migrates when the app starts",
			]);
			expect((yield* dbMigrate([main], connectFromEnv)).map(formatReport)).toEqual([
				"main: up to date",
			]);

			const rolled = yield* dbRollback(main, 1, connectFromEnv);
			expect(rolled.map(formatReport)).toEqual(["main:\n  rolled back 0002_tags"]);

			const [status] = yield* dbStatus([main], connectFromEnv);
			expect(formatReport(status!)).toBe("main:\n  applied  0001_todos\n  pending  0002_tags");
			expect(isUnhealthy(status!)).toBe(false);
		}).pipe(Effect.provide(env())),
	);

	it.effect("flags edited migrations and ledger rows without a file", () =>
		Effect.gen(function* () {
			yield* dbMigrate([main], connectFromEnv);
			const edited: PlannedDb = {
				...main,
				migrations: [{ id: "0001_todos", sql: "CREATE TABLE todos (id INTEGER);" }],
			};
			const [status] = yield* dbStatus([edited], connectFromEnv);
			expect(formatReport(status!)).toBe(
				[
					"main:",
					"  changed  0001_todos  (edited after it was applied)",
					"  unknown  0002_tags  (in the ledger, but no migration file)",
				].join("\n"),
			);
			expect(isUnhealthy(status!)).toBe(true);
		}).pipe(Effect.provide(env())),
	);

	it.effect("needs <BINDING>_URL for a libSQL database", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(dbStatus([main], connectFromEnv));
			expect(String(error)).toContain("Set DB_MAIN_URL to the main database's URL");
		}).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({})))),
	);
});
