import { splitStatements, type Migration } from "@spacefn/sql";
import { Effect, Schema } from "effect";
import type { SqlError } from "effect/sql";

import type { DbConnection, SqlStatement } from "./connection.ts";

export type { Migration };

/** The table that records applied migrations. */
export const LEDGER = "space_migrations";

export class MigrationError extends Schema.TaggedError<MigrationError>()("MigrationError", {
	reason: Schema.Literals(["changed", "no-down", "invalid-id", "invalid-steps"]),
	id: Schema.optional(Schema.String),
	message: Schema.String,
}) {}

/** Hex SHA-256 of a migration's up SQL. */
export const checksum = (sql: string): Effect.Effect<string> =>
	Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(sql))).pipe(
		Effect.map((digest) =>
			Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""),
		),
	);

// Ids become ledger keys and file names, so they stay boring.
const checkId = (id: string) =>
	/^[A-Za-z0-9_.-]+$/.test(id)
		? Effect.void
		: Effect.fail(
				new MigrationError({
					reason: "invalid-id",
					id,
					message: `Migration name "${id}" may only use letters, digits, _, - and .`,
				}),
			);

const statements = (script: string): SqlStatement[] =>
	splitStatements(script).map((sql) => ({ sql }));

const ensureLedger = (db: DbConnection) =>
	db.atomic([
		{
			sql: `CREATE TABLE IF NOT EXISTS ${LEDGER} (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`,
		},
	]);

const readLedger = (db: DbConnection) =>
	db.sql
		.unsafe<{ id: string; checksum: string }>(`SELECT id, checksum FROM ${LEDGER} ORDER BY id`)
		.pipe(Effect.map((rows) => new Map(rows.map((row) => [row.id, row.checksum]))));

export type MigrationState = "applied" | "pending" | "changed";

export interface MigrationStatus {
	readonly migrations: readonly { readonly id: string; readonly state: MigrationState }[];
	/** Ledger rows with no migration file: applied elsewhere, or the file was deleted. */
	readonly unknown: readonly string[];
}

/** Compares the migration files with the ledger. Creates the ledger when it is missing. */
export const migrationStatus = Effect.fnUntraced(function* (
	db: DbConnection,
	migrations: readonly Migration[],
): Effect.fn.Return<MigrationStatus, SqlError.SqlError> {
	yield* ensureLedger(db);
	const applied = yield* readLedger(db);
	const known = new Set(migrations.map((m) => m.id));
	const states = yield* Effect.forEach(migrations, (m) =>
		Effect.map(checksum(m.sql), (sum) => {
			const recorded = applied.get(m.id);
			const state: MigrationState =
				recorded === undefined ? "pending" : recorded === sum ? "applied" : "changed";
			return { id: m.id, state };
		}),
	);
	return { migrations: states, unknown: [...applied.keys()].filter((id) => !known.has(id)) };
});

const applyOnce = Effect.fnUntraced(function* (
	db: DbConnection,
	migrations: readonly Migration[],
): Effect.fn.Return<string[], SqlError.SqlError | MigrationError> {
	yield* ensureLedger(db);
	const applied = yield* readLedger(db);
	const ran: string[] = [];
	for (const migration of migrations) {
		yield* checkId(migration.id);
		const sum = yield* checksum(migration.sql);
		const recorded = applied.get(migration.id);
		if (recorded !== undefined) {
			if (recorded !== sum)
				return yield* new MigrationError({
					reason: "changed",
					id: migration.id,
					message: `Migration ${migration.id} changed after it was applied. Add a new migration instead of editing it.`,
				});
			continue;
		}
		yield* db.atomic([
			...statements(migration.sql),
			{
				sql: `INSERT INTO ${LEDGER} (id, checksum, applied_at) VALUES (?, ?, ?)`,
				params: [migration.id, sum, new Date().toISOString()],
			},
		]);
		ran.push(migration.id);
	}
	return ran;
});

/**
 * Applies pending migrations in order, each atomically with its ledger row,
 * and returns the ids it applied. A migration edited after it was applied is
 * refused. A SQL failure is retried once: two isolates starting cold can race
 * to the same migration, and the loser's retry finds the winner's ledger rows.
 */
export const applyMigrations = (
	db: DbConnection,
	migrations: readonly Migration[],
): Effect.Effect<string[], SqlError.SqlError | MigrationError> =>
	applyOnce(db, migrations).pipe(
		Effect.catchTag("SqlError", () => applyOnce(db, migrations)),
		Effect.withSpan("db.migrate", { attributes: { "db.migrations.total": migrations.length } }),
	);

/**
 * Rolls back the newest `steps` applied migrations, newest first, and returns
 * their ids. Everything is checked first: a migration without a down section,
 * or one edited since it was applied, refuses the whole rollback.
 */
export const rollbackMigrations = Effect.fnUntraced(function* (
	db: DbConnection,
	migrations: readonly Migration[],
	steps = 1,
): Effect.fn.Return<string[], SqlError.SqlError | MigrationError> {
	if (!Number.isInteger(steps) || steps < 1)
		return yield* new MigrationError({
			reason: "invalid-steps",
			message: "Rollback steps must be a positive integer",
		});
	yield* ensureLedger(db);
	const applied = yield* readLedger(db);
	const chosen = migrations
		.filter((m) => applied.has(m.id))
		.slice(-steps)
		.reverse();

	const verified: { id: string; down: string }[] = [];
	for (const migration of chosen) {
		yield* checkId(migration.id);
		if (migration.down === undefined)
			return yield* new MigrationError({
				reason: "no-down",
				id: migration.id,
				message: `Migration ${migration.id} has no down section, so it can't be rolled back.`,
			});
		if (applied.get(migration.id) !== (yield* checksum(migration.sql)))
			return yield* new MigrationError({
				reason: "changed",
				id: migration.id,
				message: `Migration ${migration.id} changed after it was applied, so its down section may not undo it.`,
			});
		verified.push({ id: migration.id, down: migration.down });
	}

	for (const step of verified)
		yield* db.atomic([
			...statements(step.down),
			{ sql: `DELETE FROM ${LEDGER} WHERE id = ?`, params: [step.id] },
		]);
	return verified.map((step) => step.id);
});
