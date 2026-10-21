import { splitStatements } from "./split";

export interface Migration {
	/** File name without extension, e.g. `0001_create_todos`. */
	id: string;
	/** The "up" SQL. */
	sql: string;
	/** The "down" SQL (optional). */
	down?: string;
}

/** One statement in a transaction, with optional bound parameters. */
export type MigrationStatement = string | { sql: string; params?: unknown[] };

/** What the runner needs from a database. D1 and Durable Object adapters implement this. */
export interface MigrationExecutor {
	/** Reads rows. */
	query<T>(sql: string, params?: unknown[]): Promise<T[]>;
	/** Runs `statements` as one atomic unit: all of them apply, or none. */
	transaction(statements: MigrationStatement[]): Promise<void>;
}

export const LEDGER = "space_migrations";

export class MigrationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MigrationError";
	}
}

export async function checksum(sql: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sql));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Migration ids become SQL identifiers and file names, so they stay boring. */
function assertValidId(id: string): void {
	if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
		throw new MigrationError(`Migration name "${id}" may only use letters, digits, _, - and .`);
	}
}

export interface RollbackOptions {
	/** How many applied migrations to roll back, newest first. Defaults to 1. */
	steps?: number;
}

/**
 * Rolls back the newest applied migrations, one by default. Every step is
 * checked before anything runs: a migration without a `down` section, or one
 * that changed since it was applied, refuses the whole rollback. Returns the
 * ids rolled back, newest first.
 */
export async function rollbackMigrations(
	db: MigrationExecutor,
	migrations: Migration[],
	options: RollbackOptions = {},
): Promise<string[]> {
	const steps = options.steps ?? 1;
	if (!Number.isInteger(steps) || steps < 1) {
		throw new MigrationError("Rollback steps must be a positive integer");
	}
	const rows = await db.query<{ id: string; checksum: string }>(
		`SELECT id, checksum FROM ${LEDGER}`,
	);
	const applied = new Map(rows.map((row) => [row.id, row.checksum]));
	const toRoll = migrations
		.filter((m) => applied.has(m.id))
		.slice(-steps)
		.reverse();

	const verified: { id: string; down: string }[] = [];
	for (const migration of toRoll) {
		assertValidId(migration.id);
		if (migration.down === undefined) {
			throw new MigrationError(
				`Migration ${migration.id} has no down section. Refusing to roll back.`,
			);
		}
		const sum = await checksum(migration.sql);
		if (applied.get(migration.id) !== sum) {
			throw new MigrationError(
				`Migration ${migration.id} changed after it was applied. Refusing to roll back.`,
			);
		}
		verified.push({ id: migration.id, down: migration.down });
	}

	const ran: string[] = [];
	for (const step of verified) {
		await db.transaction([
			...splitStatements(step.down),
			{ sql: `DELETE FROM ${LEDGER} WHERE id = ?`, params: [step.id] },
		]);
		ran.push(step.id);
	}
	return ran;
}

/**
 * Applies pending migrations in order. Each runs atomically together with its
 * ledger row. A migration whose file changed after it was applied is an error.
 * Returns the ids applied by this call.
 */
export async function applyMigrations(
	db: MigrationExecutor,
	migrations: Migration[],
): Promise<string[]> {
	await db.transaction([
		`CREATE TABLE IF NOT EXISTS ${LEDGER} (
			id TEXT PRIMARY KEY,
			checksum TEXT NOT NULL,
			applied_at TEXT NOT NULL
		)`,
	]);

	const applied = new Map(
		(await db.query<{ id: string; checksum: string }>(`SELECT id, checksum FROM ${LEDGER}`)).map(
			(row) => [row.id, row.checksum],
		),
	);

	const ran: string[] = [];
	for (const migration of migrations) {
		assertValidId(migration.id);
		const sum = await checksum(migration.sql);
		const known = applied.get(migration.id);
		if (known !== undefined) {
			if (known !== sum) {
				throw new MigrationError(
					`Migration ${migration.id} changed after it was applied. Add a new migration instead of editing it.`,
				);
			}
			continue;
		}
		await db.transaction([
			...splitStatements(migration.sql),
			{
				sql: `INSERT INTO ${LEDGER} (id, checksum, applied_at) VALUES (?, ?, datetime('now'))`,
				params: [migration.id, sum],
			},
		]);
		ran.push(migration.id);
	}
	return ran;
}
