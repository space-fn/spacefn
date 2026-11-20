import { Context, Effect, Layer } from "effect";
import type { SqlClient } from "effect/sql";

import { libsqlFromConfig } from "./db.ts";

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS space_kv (
		key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER
	) WITHOUT ROWID`,
	`CREATE TABLE IF NOT EXISTS space_rate (
		key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL
	) WITHOUT ROWID`,
	`CREATE TABLE IF NOT EXISTS space_queue (
		id TEXT PRIMARY KEY, queue TEXT NOT NULL, body BLOB NOT NULL,
		attempts INTEGER NOT NULL DEFAULT 0, visible_at INTEGER NOT NULL, sent_at INTEGER NOT NULL
	)`,
	"CREATE INDEX IF NOT EXISTS space_queue_due ON space_queue (queue, visible_at)",
	`CREATE TABLE IF NOT EXISTS space_bus (
		id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT NOT NULL, message TEXT NOT NULL,
		origin TEXT NOT NULL, at INTEGER NOT NULL
	)`,
];

/**
 * The database behind Kv, RateLimiter, Queue and Bus. The web, queue and cron
 * processes share nothing else, so whatever one writes the others must see.
 * Configured by `SPACE_STATE_URL`; locally `file:<SPACE_DATA_DIR>/state.db`.
 */
export class SpaceState extends Context.Service<SpaceState, SqlClient.SqlClient>()(
	"spacefn/bun/SpaceState",
) {
	static readonly layer = Layer.effect(
		SpaceState,
		Effect.gen(function* () {
			const { sql } = yield* libsqlFromConfig("SPACE_STATE", "state");
			for (const statement of SCHEMA) yield* sql.unsafe(statement);
			return sql;
		}),
	);
}

/** Runs `effect` when at least `everyMillis` passed since it last ran in this process. */
export const throttled = (everyMillis: number) => {
	let last = Number.NEGATIVE_INFINITY;
	return <E, R>(now: number, effect: Effect.Effect<void, E, R>): Effect.Effect<void, E, R> => {
		if (now - last < everyMillis) return Effect.void;
		last = now;
		return effect;
	};
};
