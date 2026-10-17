import {
	durableObjectExecutor,
	runMigrations,
	type DurableStorageLike,
	type Migration,
} from "../db";

/** Applies a tenant's migrations to its Durable Object storage. Safe to call on every start. */
export function migrateTenant(
	storage: DurableStorageLike,
	migrations: Migration[],
): Promise<string[]> {
	return runMigrations(durableObjectExecutor(storage), migrations);
}

/** Runs one query against a tenant's SQLite storage and returns its rows. */
export function queryTenant<T>(storage: DurableStorageLike, sql: string, values: unknown[]): T[] {
	return storage.sql.exec(sql, ...values).toArray() as T[];
}

export interface TenantDump {
	exportedAt: string;
	tables: { name: string; rows: Record<string, unknown>[] }[];
}

/** Reads every user table of a tenant as JSON rows. Includes the migration ledger. */
export function exportTenantData(storage: DurableStorageLike, now: Date): TenantDump {
	const names = storage.sql
		.exec(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%' ORDER BY name",
		)
		.toArray() as { name: string }[];
	return {
		exportedAt: now.toISOString(),
		tables: names.map(({ name }) => ({
			name,
			rows: storage.sql.exec(`SELECT * FROM "${name.replaceAll('"', '""')}"`).toArray() as Record<
				string,
				unknown
			>[],
		})),
	};
}

/** Erases a tenant's storage. Only call this after its data has been exported. */
export function wipeTenantData(storage: DurableStorageLike): Promise<void> {
	return storage.deleteAll();
}
