import type {
	CompiledQuery,
	DatabaseConnection,
	Dialect,
	Driver,
	QueryResult,
	TransactionSettings,
} from "kysely";

import { currentTrail, type TrailResolver } from "./scope.js";

export interface TrailDialectOptions {
	/** Defaults to the ambient `currentTrail()`. */
	resolve?: TrailResolver;
	/** Max characters of SQL recorded per span. Default: 1000. */
	sqlMaxLength?: number;
}

const SQL_OPERATIONS: Record<string, string> = {
	SelectQueryNode: "select",
	InsertQueryNode: "insert",
	UpdateQueryNode: "update",
	DeleteQueryNode: "delete",
	RawNode: "raw",
	MergeQueryNode: "merge",
};

/**
 * Wrap a Kysely dialect so every query becomes a `db` span under the ambient
 * trail: SQL text, row count, duration, and errors. The driver-level seam is
 * deliberate — Kysely's plugin API never calls `transformResult` for failed
 * queries, so a plugin cannot see the error path.
 *
 * ```ts
 * const db = new Kysely({ dialect: trailDialect(new SqliteDialect({ ... })) });
 * ```
 */
export function trailDialect(dialect: Dialect, options: TrailDialectOptions = {}): Dialect {
	const resolve = options.resolve ?? currentTrail;
	const sqlMaxLength = options.sqlMaxLength ?? 1000;
	return {
		createAdapter() {
			return dialect.createAdapter();
		},
		createQueryCompiler() {
			return dialect.createQueryCompiler();
		},
		createIntrospector(db) {
			return dialect.createIntrospector(db);
		},
		createDriver() {
			return wrapDriver(dialect.createDriver(), resolve, sqlMaxLength);
		},
	};
}

function wrapDriver(driver: Driver, resolve: TrailResolver, sqlMaxLength: number): Driver {
	return {
		async init() {
			await driver.init();
		},
		async destroy() {
			await driver.destroy();
		},
		async acquireConnection() {
			return new WrappedConnection(await driver.acquireConnection(), resolve, sqlMaxLength);
		},
		async beginTransaction(connection: DatabaseConnection, settings: TransactionSettings) {
			await driver.beginTransaction(unwrap(connection), settings);
		},
		async commitTransaction(connection: DatabaseConnection) {
			await driver.commitTransaction(unwrap(connection));
		},
		async rollbackTransaction(connection: DatabaseConnection) {
			await driver.rollbackTransaction(unwrap(connection));
		},
		async releaseConnection(connection: DatabaseConnection) {
			await driver.releaseConnection(unwrap(connection));
		},
	};
}

class WrappedConnection implements DatabaseConnection {
	readonly raw: DatabaseConnection;

	#resolve: TrailResolver;
	#sqlMaxLength: number;

	constructor(raw: DatabaseConnection, resolve: TrailResolver, sqlMaxLength: number) {
		this.raw = raw;
		this.#resolve = resolve;
		this.#sqlMaxLength = sqlMaxLength;
	}

	async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
		const trail = this.#resolve();
		if (!trail) return this.raw.executeQuery<R>(compiledQuery);
		return trail.span(`db.${operationOf(compiledQuery)}`, "db", async (span) => {
			span.set("db.operation", operationOf(compiledQuery));
			span.set("db.sql", compiledQuery.sql.slice(0, this.#sqlMaxLength));
			const result = await this.raw.executeQuery<R>(compiledQuery);
			span.set("db.rows", result.rows.length);
			return result;
		});
	}

	async *streamQuery<R>(
		compiledQuery: CompiledQuery,
		chunkSize?: number,
	): AsyncIterableIterator<QueryResult<R>> {
		const trail = this.#resolve();
		if (!trail) {
			yield* this.raw.streamQuery<R>(compiledQuery, chunkSize);
			return;
		}
		const span = trail.startSpan(`db.${operationOf(compiledQuery)}`, "db");
		span.set("db.operation", operationOf(compiledQuery));
		span.set("db.sql", compiledQuery.sql.slice(0, this.#sqlMaxLength));
		try {
			for await (const result of this.raw.streamQuery<R>(compiledQuery, chunkSize)) {
				yield result;
			}
		} catch (error) {
			span.setError(error);
			trail.error(error);
			throw error;
		} finally {
			span.end();
		}
	}
}

function unwrap(connection: DatabaseConnection): DatabaseConnection {
	return connection instanceof WrappedConnection ? connection.raw : connection;
}

function operationOf(query: CompiledQuery): string {
	return SQL_OPERATIONS[query.query.kind] ?? "query";
}
