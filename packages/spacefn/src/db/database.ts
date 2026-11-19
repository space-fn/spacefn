import type { Migration, QueryMode } from "@spacefn/sql";
import { Context, Effect, Layer, Option, Schema, SchemaTransformation, type Scope } from "effect";
import type { SqlError } from "effect/sql";

import type { DbConnection } from "./connection.ts";
import { applyMigrations, type MigrationError } from "./migrate.ts";

/** One query as `space gen` writes it into `.space/db/<name>.ts`. */
export interface QueryDefinition {
	readonly mode: QueryMode;
	/** Column → type in `@param` syntax: `"number"`, `"string?"` (nullable). */
	readonly columns: Readonly<Record<string, string>>;
	/** SQL pieces in order. A part with a `gate` is used only when every gate parameter is given. */
	readonly parts: readonly {
		readonly sql: string;
		readonly params: readonly string[];
		readonly gate: readonly string[] | null;
	}[];
}

export interface DbDefinition {
	readonly name: string;
	readonly migrations: readonly Migration[];
	readonly queries: Readonly<Record<string, QueryDefinition>>;
}

/** The generated types of one query. */
export interface QueryTypes {
	readonly params: object;
	readonly row: object;
	readonly mode: QueryMode;
}

type QueryResult<T extends QueryTypes> = T["mode"] extends "many"
	? ReadonlyArray<T["row"]>
	: T["mode"] extends "one"
		? Option.Option<T["row"]>
		: void;

/** A query takes no argument when every parameter is optional. */
export type QueryFn<T extends QueryTypes> = {} extends T["params"]
	? (params?: T["params"]) => Effect.Effect<QueryResult<T>, SqlError.SqlError>
	: (params: T["params"]) => Effect.Effect<QueryResult<T>, SqlError.SqlError>;

/** A database's typed queries, one function per query file. */
export type Database<Q extends Record<keyof Q, QueryTypes>> = {
	readonly [K in keyof Q]: QueryFn<Q[K]>;
};

// SQLite has no boolean or blob types it returns consistently: booleans are
// 0/1, and drivers return blobs as Uint8Array or ArrayBuffer.
const SqliteBoolean = Schema.Union([Schema.Number, Schema.Boolean]).pipe(
	Schema.decodeTo(
		Schema.Boolean,
		SchemaTransformation.transform({
			decode: (value) => value !== 0 && value !== false,
			encode: (value) => (value ? 1 : 0),
		}),
	),
);
const Bytes = Schema.Union([Schema.Uint8Array, Schema.instanceOf(ArrayBuffer)]).pipe(
	Schema.decodeTo(
		Schema.Uint8Array,
		SchemaTransformation.transform({
			decode: (value) => (value instanceof ArrayBuffer ? new Uint8Array(value) : value),
			encode: (value) => value,
		}),
	),
);
const COLUMN: Record<string, Schema.Codec<unknown, unknown>> = {
	string: Schema.String,
	number: Schema.Number,
	boolean: SqliteBoolean as Schema.Codec<unknown, unknown>,
	bytes: Bytes as Schema.Codec<unknown, unknown>,
	unknown: Schema.Unknown,
};

const rowSchema = (columns: Readonly<Record<string, string>>) =>
	Schema.Struct(
		Object.fromEntries(
			Object.entries(columns).map(([name, declared]) => {
				const nullable = declared.endsWith("?");
				const base = COLUMN[nullable ? declared.slice(0, -1) : declared] ?? Schema.Unknown;
				return [name, nullable ? Schema.NullOr(base) : base];
			}),
		),
	);

const encodeParam = (value: unknown) =>
	value === true ? 1 : value === false ? 0 : value === undefined ? null : value;

/** The SQL and values for one call, leaving out parts whose gate parameters are missing. */
export const buildQuery = (
	query: QueryDefinition,
	params: Readonly<Record<string, unknown>>,
): { readonly sql: string; readonly values: unknown[] } => {
	const sql: string[] = [];
	const values: unknown[] = [];
	for (const part of query.parts) {
		if (part.gate && !part.gate.every((name) => params[name] !== undefined)) continue;
		sql.push(part.sql);
		for (const name of part.params) values.push(encodeParam(params[name]));
	}
	return { sql: sql.join("\n"), values };
};

const makeQuery = (connection: DbConnection, db: string, name: string, query: QueryDefinition) => {
	const decode = Schema.decodeUnknownEffect(Schema.Array(rowSchema(query.columns)));
	return (params: Readonly<Record<string, unknown>> = {}) => {
		const { sql, values } = buildQuery(query, params);
		const statement = connection.sql.unsafe<object>(sql, values);
		if (query.mode === "exec") return Effect.asVoid(statement);
		return statement.pipe(
			Effect.flatMap((rows) =>
				decode(rows).pipe(
					Effect.mapError(
						(cause) =>
							new Error(
								`Query ${db}.${name} returned rows that don't match its generated types. Run \`space gen\`, or check the migrations ran.`,
								{ cause },
							),
					),
					Effect.orDie,
				),
			),
			Effect.map((rows) => (query.mode === "one" ? Option.fromNullishOr(rows[0]) : rows)),
		);
	};
};

/** Typed functions for every query of `definition`, running on `connection`. */
export const makeDatabase = <Q extends Record<keyof Q, QueryTypes>>(
	connection: DbConnection,
	definition: DbDefinition,
): Database<Q> =>
	Object.fromEntries(
		Object.entries(definition.queries).map(([name, query]) => [
			name,
			makeQuery(connection, definition.name, name, query),
		]),
	) as Database<Q>;

export interface DatabaseLayerOptions {
	/** Apply pending migrations while the layer builds. Default `true`. */
	readonly migrate?: boolean;
}

/** What a generated database class has besides being a service. */
export interface DatabaseStatics<Self> {
	readonly definition: DbDefinition;
	/** The database on `connect`, migrated first unless `migrate: false`. */
	readonly layer: <E, R>(
		connect: Effect.Effect<DbConnection, E, R>,
		options?: DatabaseLayerOptions,
	) => Layer.Layer<Self, E | SqlError.SqlError | MigrationError, Exclude<R, Scope.Scope>>;
}

/** Any generated database class, as the manifest and the targets see it. */
export type DatabaseClass = Context.Key<any, any> & DatabaseStatics<any>;

/**
 * The service class for one database. `space gen` writes, in `.space/db/main.ts`:
 *
 * ```ts
 * export class MainDb extends database<MainDb, Queries>()({ name, migrations, queries }) {}
 * ```
 *
 * and handlers use it like any service: `const db = yield* MainDb`, then
 * `yield* db.listTodos({ done: false })`. Targets provide it with `MainDb.layer(connection)`.
 */
export const database =
	<Self, Q extends Record<keyof Q, QueryTypes>>() =>
	(definition: DbDefinition) => {
		const Service = Context.Service<Self, Database<Q>>()(`spacefn/db/${definition.name}`);
		const layer: DatabaseStatics<Self>["layer"] = (connect, options = {}) =>
			Layer.effect(
				Service,
				Effect.gen(function* () {
					const connection = yield* connect;
					if (options.migrate !== false) yield* applyMigrations(connection, definition.migrations);
					return makeDatabase<Q>(connection, definition);
				}),
			);
		return Object.assign(Service, { definition, layer } satisfies DatabaseStatics<Self>);
	};
