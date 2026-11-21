import { Cause, Context, Effect, Layer, Predicate, type Scope } from "effect";

import type { DbConnection } from "./db/connection.ts";
import type { DatabaseClass } from "./db/database.ts";
import { SpaceError } from "./errors.ts";
import type { ManifestDb, ManifestEnv, ManifestLayers, Unchecked } from "./manifest.ts";

/**
 * How the target reaches a database of the manifest, or `undefined` to leave
 * it out (Durable Object SQLite lives inside each object, not in the app).
 * The target's `platform` provides it; {@link databases} uses it.
 */
export class DbConnector extends Context.Service<
	DbConnector,
	(db: Unchecked<ManifestDb>) => Effect.Effect<DbConnection, unknown, Scope.Scope> | undefined
>()("spacefn/DbConnector") {}

export interface AppLayerOptions<P, E> {
	/** The target's services (Kv, Blob, Queue, Bus, RateLimiter, HttpClient, its ConfigProvider, ...). */
	readonly platform: Layer.Layer<P, E>;
	/**
	 * How the target reaches each database, or `undefined` to leave it out
	 * (Durable Object SQLite lives inside each object, not in the app).
	 */
	readonly connect: (
		db: Unchecked<ManifestDb>,
	) => Effect.Effect<DbConnection, unknown, Scope.Scope> | undefined;
}

const exportError = (code: string, file: string, message: string, hint: string) =>
	new SpaceError({ code, file, message, hint });

const defaultOf = (entry: { readonly module: unknown }) =>
	(entry.module as { default?: unknown }).default;

const envLayerOf = (entry: Unchecked<ManifestEnv>) => {
	const value = defaultOf(entry);
	return Predicate.hasProperty(value, "layer") && Layer.isLayer(value.layer)
		? Effect.succeed(value.layer as Layer.Layer<any, SpaceError>)
		: Effect.fail(
				exportError(
					"ENV_EXPORT",
					entry.file,
					"The default export is not the app env",
					"Export it with: export default defineEnv({ ... })",
				),
			);
};

const userLayerOf = (entry: Unchecked<ManifestLayers>) => {
	const value = defaultOf(entry);
	return Layer.isLayer(value)
		? Effect.succeed(value as Layer.Layer<any, unknown, any>)
		: Effect.fail(
				exportError(
					"LAYERS_EXPORT",
					entry.file,
					"The default export is not a Layer",
					"Export the app's services with: export default Layer.mergeAll(...)",
				),
			);
};

const databaseOf = (entry: Unchecked<ManifestDb>) => {
	const value = defaultOf(entry);
	return Predicate.hasProperty(value, "layer") && Predicate.isFunction(value.layer)
		? Effect.succeed(value as DatabaseClass)
		: Effect.fail(
				exportError(
					"DB_EXPORT",
					`.space/db/${entry.name}.ts`,
					"The generated database module is out of date",
					"Run space gen.",
				),
			);
};

/** Fails a layer with a SpaceError naming `what`, keeping the cause readable. */
const startError =
	(code: string, what: string) =>
	<A, E, R>(layer: Layer.Layer<A, E, R>): Layer.Layer<A, SpaceError, R> =>
		Layer.effectContext(
			Layer.build(layer).pipe(
				Effect.catchCause((cause) =>
					Effect.fail(
						new SpaceError({
							code,
							message: `${what} didn't start: ${Cause.pretty(cause)}`,
							hint: "Check its configuration and bindings.",
						}),
					),
				),
			),
		);

/**
 * Every service the app's code can use, for a target to provide to HTTP, queue
 * consumers and crons: the target's `platform`, then `configs/env.ts`, then each
 * database (migrated as it starts), then `app/layers.ts`, each able to use the
 * ones before. Fails when a convention file exports the wrong thing.
 */
export const appLayer = <P, E>(
	manifest: {
		readonly env?: Unchecked<ManifestEnv> | undefined;
		readonly layers?: Unchecked<ManifestLayers> | undefined;
		readonly db: readonly Unchecked<ManifestDb>[];
	},
	options: AppLayerOptions<P, E>,
): Layer.Layer<any, SpaceError | E> =>
	Layer.unwrap(
		Effect.gen(function* () {
			let services: Layer.Layer<any, any> = options.platform;
			if (manifest.env) services = Layer.provideMerge(yield* envLayerOf(manifest.env), services);
			const databases: Layer.Layer<any, SpaceError>[] = [];
			for (const entry of manifest.db) {
				const Database = yield* databaseOf(entry);
				const connect = options.connect(entry);
				if (connect)
					databases.push(startError("DB_START", `Database ${entry.name}`)(Database.layer(connect)));
			}
			if (databases.length > 0)
				services = Layer.provideMerge(
					Layer.mergeAll(...(databases as [Layer.Layer<any, SpaceError>])),
					services,
				);
			if (manifest.layers)
				services = Layer.provideMerge(
					startError("LAYERS_START", "app/layers.ts")(yield* userLayerOf(manifest.layers)),
					services,
				);
			return services as Layer.Layer<any, SpaceError | E>;
		}),
	);

/**
 * Every database of `app/db/`, connected through the target's {@link DbConnector}
 * and migrated as it starts when its `config.json` says `"migrateOn": "startup"`.
 * For the entry's `services`, after `platform`.
 */
export const databases = (manifest: {
	readonly db: readonly Unchecked<ManifestDb>[];
}): Layer.Layer<any, SpaceError, DbConnector> =>
	// Contravariant in what it provides, so "any databases" is typed through Layer.Any.
	Layer.unwrap(
		Effect.gen(function* () {
			const connect = yield* DbConnector;
			const layers: Layer.Layer<any, SpaceError>[] = [];
			for (const entry of manifest.db) {
				const Database = yield* databaseOf(entry);
				const connection = connect(entry);
				if (connection)
					layers.push(startError("DB_START", `Database ${entry.name}`)(Database.layer(connection)));
			}
			return layers.length === 0
				? Layer.empty
				: Layer.mergeAll(...(layers as [Layer.Layer<any, SpaceError>]));
		}),
	) as Layer.Any as Layer.Layer<any, SpaceError, DbConnector>;
