import { describe, expect, it } from "@effect/vitest";
import { createClient } from "@libsql/client";
import { ConfigProvider, Effect } from "effect";

import { libsqlConnection, libsqlFromConfig } from "../src/db/libsql.ts";
import { applyMigrations } from "../src/db/migrate.ts";

describe("libsql", () => {
	it.effect("runs migrations atomically on a libSQL client", () =>
		Effect.gen(function* () {
			const db = yield* libsqlConnection(createClient({ url: ":memory:" }));
			const todos = { id: "0001_todos", sql: "CREATE TABLE todos (id INTEGER PRIMARY KEY);" };
			const broken = { id: "0002_broken", sql: "CREATE TABLE a (x);\nNOT SQL;" };
			expect(yield* applyMigrations(db, [todos])).toEqual(["0001_todos"]);
			expect((yield* Effect.flip(applyMigrations(db, [todos, broken])))._tag).toBe("SqlError");
			const tables = yield* db.sql.unsafe<{ name: string }>(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'a'",
			);
			expect(tables).toEqual([]);
		}),
	);

	it.effect("reads the URL from <BINDING>_URL", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(libsqlFromConfig("DB_MAIN"));
			expect(String(error)).toContain("DB_MAIN_URL");
		}).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({})))),
	);
});
