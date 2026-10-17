import type { MigrationExecutor } from "./migrate";

/** The part of a D1 database the executor uses. */
export interface D1Database {
	prepare(sql: string): { bind(...values: unknown[]): { all<T>(): Promise<{ results: T[] }> } };
	batch(statements: unknown[]): Promise<unknown[]>;
}

/** The part of a Durable Object's SQLite storage the executor uses. */
export interface SqlStorageLike {
	exec(sql: string, ...params: unknown[]): { toArray(): unknown[] };
}

export interface DurableStorageLike {
	sql: SqlStorageLike;
	transactionSync<T>(fn: () => T): T;
	deleteAll(): Promise<void>;
}

/**
 * D1 executor. A D1 `batch` runs as one transaction, so each migration applies
 * atomically with its ledger row.
 */
export function d1Executor(db: D1Database): MigrationExecutor {
	return {
		query: async <T>(sql: string, params: unknown[] = []) => {
			const { results } = await db
				.prepare(sql)
				.bind(...params)
				.all<T>();
			return results;
		},
		transaction: async (statements) => {
			await db.batch(statements.map((sql) => db.prepare(sql).bind()));
		},
	};
}

/** Durable Object SQLite executor. `transactionSync` makes each migration atomic. */
export function durableObjectExecutor(storage: DurableStorageLike): MigrationExecutor {
	return {
		query: async <T>(sql: string, params: unknown[] = []) =>
			storage.sql.exec(sql, ...params).toArray() as T[],
		transaction: async (statements) => {
			storage.transactionSync(() => {
				for (const statement of statements) storage.sql.exec(statement);
			});
		},
	};
}
