import { Context, Effect, Layer, Option, Schema, SchemaTransformation, type Scope } from "effect";
import type { SqlError } from "effect/sql";

import type { Migration, QueryMode } from "../sql/index.ts";
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

/** When a database applies its migrations, from `migrateOn` in `app/db/<name>/config.json`. */
export type MigrateOn = "startup" | "call";

export interface DbDefinition {
	readonly name: string;
	readonly migrations: readonly Migration[];
	readonly queries: Readonly<Record<string, QueryDefinition>>;
	/** `startup`: as its layer builds. `call`: only through `migrate()`. Default `startup`. */
	readonly migrateOn?: MigrateOn;
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

/** The first part of each dotted name: a folder in `queries/`. */
type Namespaces<Q> = keyof Q extends infer K
	? K extends `${infer Head}.${string}`
		? Head
		: never
	: never;

/** The queries inside folder `N`, named without it. */
type Inside<Q, N extends string> = {
	[K in keyof Q as K extends `${N}.${infer Rest}` ? Rest : never]: Q[K];
};

/**
 * A database's typed queries, one function per query file. A folder in
 * `queries/` is a namespace: `todos/mark-done.sql` is `db.todos.markDone`.
 */
export type Database<Q extends Record<keyof Q, QueryTypes>> = {
	readonly [K in keyof Q as K extends `${string}.${string}` ? never : K]: QueryFn<Q[K]>;
} & {
	readonly [N in Namespaces<Q>]: Database<Inside<Q, N> & Record<keyof Inside<Q, N>, QueryTypes>>;
};

/**
 * The queries as statics of the database class, each needing the database:
 * `yield* MainDb.listTodos()`, `yield* MainDb.todos.markDone({ id })`.
 */
export type DatabaseAccessors<D, Self> = {
	readonly [K in keyof D]: D[K] extends (
		...args: infer A
	) => Effect.Effect<infer X, infer E, infer R>
		? (...args: A) => Effect.Effect<X, E, R | Self>
		: DatabaseAccessors<D[K], Self>;
};

/**
 * Names a query can't have: the database class's own statics and the
 * service's. Codegen refuses a query file with one of them.
 */
export const RESERVED_QUERY_NAMES: readonly string[] = [
	"definition",
	"layer",
	"migrate",
	"key",
	"of",
	"context",
	"use",
	"useSync",
	"pipe",
	"toJSON",
	"stack",
	"name",
	"length",
	"prototype",
	"constructor",
];

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

/** The connection each built database runs on, for `migrate()`, without widening its type. */
const connections = new WeakMap<object, DbConnection>();

/** Typed functions for every query of `definition`, running on `connection`. */
export const makeDatabase = <Q extends Record<keyof Q, QueryTypes>>(
	connection: DbConnection,
	definition: DbDefinition,
): Database<Q> => {
	const root: Record<string, unknown> = {};
	for (const [name, query] of Object.entries(definition.queries)) {
		const path = name.split(".");
		let level = root;
		for (const folder of path.slice(0, -1))
			level = (level[folder] ??= {}) as Record<string, unknown>;
		level[path.at(-1)!] = makeQuery(connection, definition.name, name, query);
	}
	return root as Database<Q>;
};

export interface DatabaseLayerOptions {
	/** Apply pending migrations while the layer builds. Default: whether `migrateOn` is `startup`. */
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
	/**
	 * Applies pending migrations now and gives their ids, for a database with
	 * `migrateOn: "call"`: from a route, a cron or a script of your own.
	 */
	readonly migrate: () => Effect.Effect<
		readonly string[],
		SqlError.SqlError | MigrationError,
		Self
	>;
}

/** Accessors for every query of `definition`, through the database service `service`. */
const makeAccessors = (
	service: {
		readonly use: (f: (db: any) => Effect.Effect<any, any, any>) => Effect.Effect<any, any, any>;
	},
	definition: DbDefinition,
) => {
	const root: Record<string, unknown> = {};
	for (const name of Object.keys(definition.queries)) {
		const path = name.split(".");
		let level = root;
		for (const folder of path.slice(0, -1))
			level = (level[folder] ??= {}) as Record<string, unknown>;
		level[path.at(-1)!] = (params?: unknown) =>
			service.use((db) => path.reduce((at, key) => at[key], db)(params));
	}
	return root;
};

/** Any generated database class, as the manifest and the targets see it. */
export type DatabaseClass = Context.Key<any, any> & DatabaseStatics<any>;

/**
 * The service class for one database. `space gen` writes, in `.space/db/main.ts`:
 *
 * ```ts
 * export class MainDb extends database<MainDb, Queries>()({ name, migrations, queries }) {}
 * ```
 *
 * and handlers call its queries as statics, `yield* MainDb.listTodos({ done: false })`,
 * or get them all with `const db = yield* MainDb`. Targets provide it with `MainDb.layer(connection)`.
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
					if (options.migrate ?? (definition.migrateOn ?? "startup") === "startup")
						yield* applyMigrations(connection, definition.migrations);
					const db = makeDatabase<Q>(connection, definition);
					connections.set(db, connection);
					return db;
				}),
			);
		const migrate: DatabaseStatics<Self>["migrate"] = () =>
			Effect.gen(function* () {
				const db = yield* Service;
				return yield* applyMigrations(connections.get(db as object)!, definition.migrations);
			});
		return Object.assign(
			Service,
			makeAccessors(Service, definition) as DatabaseAccessors<Database<Q>, Self>,
			{ definition, layer, migrate } satisfies DatabaseStatics<Self>,
		);
	};
