import { withSpan } from "./span";

interface D1Result {
	results?: unknown;
	meta?: { rows_read?: number; rows_written?: number };
}

interface D1StatementLike {
	bind(...values: unknown[]): D1StatementLike;
	first(column?: string): Promise<unknown>;
	run(): Promise<D1Result>;
	all(): Promise<D1Result>;
	raw(options?: unknown): Promise<unknown>;
}

export interface D1Like {
	prepare(sql: string): D1StatementLike;
	batch(statements: D1StatementLike[]): Promise<D1Result[]>;
	exec(sql: string): Promise<unknown>;
}

/** Duck-types a D1 database, since the Workers types are not available here. */
export function isD1(value: unknown): value is D1Like {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as D1Like).prepare === "function" &&
		typeof (value as D1Like).batch === "function" &&
		typeof (value as D1Like).exec === "function"
	);
}

function queryAttributes(operation: string, sql: string) {
	return { "db.system": "d1", "db.operation.name": operation, "db.query.text": sql };
}

function recordResult(result: unknown, span: { setAttributes(a: Record<string, number>): void }) {
	const meta = (result as D1Result | undefined)?.meta;
	if (!meta) return;
	const attributes: Record<string, number> = {};
	if (typeof meta.rows_read === "number") attributes["db.rows_read"] = meta.rows_read;
	if (typeof meta.rows_written === "number") attributes["db.rows_written"] = meta.rows_written;
	span.setAttributes(attributes);
}

/** Maps each traced statement back to the native one D1 needs in `batch`. */
const nativeStatements = new WeakMap<object, D1StatementLike>();

function traceStatement(statement: D1StatementLike, sql: string): D1StatementLike {
	const run = <T>(operation: string, fn: () => Promise<T>) =>
		withSpan("db.query", async (span) => {
			span.setAttributes(queryAttributes(operation, sql));
			const result = await fn();
			recordResult(result, span);
			return result;
		});

	const traced: D1StatementLike = {
		bind: (...values) => traceStatement(statement.bind(...values), sql),
		first: (column) => run("first", () => statement.first(column)),
		run: () => run("run", () => statement.run()),
		all: () => run("all", () => statement.all()),
		raw: (options) => run("raw", () => statement.raw(options)),
	};
	nativeStatements.set(traced, statement);
	return traced;
}

/** Wraps a D1 database so every query becomes a `db.query` span. */
export function traceD1(db: D1Like): D1Like {
	return {
		prepare: (sql) => traceStatement(db.prepare(sql), sql),
		batch: (statements) =>
			withSpan("db.query", async (span) => {
				span.setAttributes({
					"db.system": "d1",
					"db.operation.name": "batch",
					"db.batch.size": statements.length,
				});
				// D1 only accepts its own statement objects, so unwrap the traced ones.
				const native = statements.map((statement) => nativeStatements.get(statement) ?? statement);
				return db.batch(native as D1StatementLike[]);
			}),
		exec: (sql) =>
			withSpan("db.query", async (span) => {
				span.setAttributes(queryAttributes("exec", sql));
				return db.exec(sql);
			}),
	};
}
