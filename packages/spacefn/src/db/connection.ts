import { Effect } from "effect";
import type { SqlClient, SqlError } from "effect/sql";

/** One SQL statement with positional (`?`) parameters. */
export interface SqlStatement {
	readonly sql: string;
	readonly params?: readonly unknown[];
}

/**
 * A database as spacefn uses it: Effect's `SqlClient` for queries, plus a way
 * to run statements atomically. D1 has no transactions, only atomic batches,
 * so each target says how.
 */
export interface DbConnection {
	readonly sql: SqlClient.SqlClient;
	/** Runs every statement, or none of them. */
	readonly atomic: (statements: readonly SqlStatement[]) => Effect.Effect<void, SqlError.SqlError>;
}

/** A connection whose atomic unit is a transaction. Right for libSQL, SQLite and DO SQLite with `storage`. */
export const transactional = (sql: SqlClient.SqlClient): DbConnection => ({
	sql,
	atomic: (statements) =>
		sql.withTransaction(
			Effect.forEach(statements, (s) => sql.unsafe(s.sql, s.params ?? []), { discard: true }),
		),
});
