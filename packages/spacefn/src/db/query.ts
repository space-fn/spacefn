/** A SQL value as SQLite stores it. Used for parameters with no `@param` type. */
export type SqlValue = string | number | bigint | Uint8Array | null;

/** The part of a D1 database that typed queries use. */
export interface D1Reader {
	prepare(sql: string): {
		bind(...values: unknown[]): { all<T>(): Promise<{ results?: T[] }> };
	};
}

/** Runs a query on D1 and returns its rows. Traced through the binding when it is wrapped. */
export async function queryD1<T>(db: D1Reader, sql: string, values: unknown[]): Promise<T[]> {
	const { results } = await db
		.prepare(sql)
		.bind(...values)
		.all<T>();
	return results ?? [];
}
