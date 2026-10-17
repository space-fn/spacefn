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
