import { D1Client } from "@effect/sql-d1";
import { SqliteClient } from "@effect/sql-sqlite-do";
import { Effect, type Scope } from "effect";
import { Reactivity } from "effect/reactivity";
import type { ManifestDb } from "spacefn";
import {
	libsqlFromConfig,
	transactional,
	type DbConnection,
	type Unchecked,
} from "spacefn/internal/runtime";

import { binding, type WorkerEnv } from "./bindings.ts";

/** A D1 database. D1 has no transactions, so atomic work runs as one batch. */
export const d1 = (db: D1Database): Effect.Effect<DbConnection, never, Scope.Scope> =>
	Effect.gen(function* () {
		const client = yield* D1Client.make({ db });
		return {
			sql: client,
			atomic: (statements) =>
				Effect.asVoid(client.batch(statements.map((s) => client.unsafe(s.sql, s.params ?? [])))),
		} satisfies DbConnection;
	}).pipe(Effect.provide(Reactivity.layer));

/**
 * SQLite inside a Durable Object. Use it in the object's constructor:
 * `MainDb.layer(durableObjectSql(ctx.storage))`. It goes through `storage`, so
 * transactions (and so migrations) work.
 */
export const durableObjectSql = (
	storage: DurableObjectStorage,
): Effect.Effect<DbConnection, never, Scope.Scope> =>
	SqliteClient.make({ storage }).pipe(Effect.map(transactional), Effect.provide(Reactivity.layer));

/**
 * How the Worker reaches each database of the manifest: D1 by its binding,
 * libSQL by `<BINDING>_URL`. Durable Object databases are left to their objects.
 */
export const connectFor =
	(env: WorkerEnv) =>
	(db: Unchecked<ManifestDb>): Effect.Effect<DbConnection, unknown, Scope.Scope> | undefined => {
		switch (db.driver) {
			case "d1":
				return Effect.suspend(() => d1(binding<D1Database>(env, db.binding, "D1")));
			case "libsql":
				return libsqlFromConfig(db.binding);
			case "durable-object":
				return undefined;
		}
	};
