import { splitStatements } from "./split";

export interface Migration {
	/** File name without extension, e.g. `0001_create_todos`. */
	id: string;
	/** The "up" SQL. */
	sql: string;
	/** The "down" SQL (optional). */
	down?: string;
}

/** What the runner needs from a database. D1 and Durable Object adapters implement this. */
export interface MigrationExecutor {
	/** Reads rows. */
	query<T>(sql: string, params?: unknown[]): Promise<T[]>;
	/** Runs `statements` as one atomic unit: all of them apply, or none. */
	transaction(statements: string[]): Promise<void>;
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

/**
 * Applies pending migrations in order. Each runs atomically together with its
 * ledger row. A migration whose file changed after it was applied is an error.
 * Returns the ids applied by this call.
 */
export async function rollbackMigrations(
	db: MigrationExecutor,
	migrations: Migration[],
): Promise<string[]> {
	const applied = new Set(
		(await db.query<{ id: string }>(`SELECT id FROM ${LEDGER}`)).map((r) => r.id),
	);
	const toRoll = migrations.filter((m) => applied.has(m.id)).reverse();
	const ran: string[] = [];
	for (const migration of toRoll) {
		await db.transaction([
			...splitStatements(migration.sql),
			`DELETE FROM ${LEDGER} WHERE id = '${migration.id}'`,
		]);
		ran.push(migration.id);
	}
	return ran;
}

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
		if (!/^[A-Za-z0-9_.-]+$/.test(migration.id)) {
			throw new MigrationError(
				`Migration name "${migration.id}" may only use letters, digits, _, - and .`,
			);
		}
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
		const ledger = `INSERT INTO ${LEDGER} (id, checksum, applied_at) VALUES ('${migration.id}', '${sum}', datetime('now'))`;
		await db.transaction([...splitStatements(migration.sql), ledger]);
		ran.push(migration.id);
	}
	return ran;
}
