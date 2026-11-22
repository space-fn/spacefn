import { Cause, Context, Effect, Layer, Predicate, type Scope } from "effect";

import type { DbConnection } from "./db/connection.ts";
import type { DatabaseClass } from "./db/database.ts";
import { SpaceError } from "./errors.ts";
import type { ManifestDb, Unchecked } from "./manifest.ts";

/**
 * How the target reaches a database of the manifest, or `undefined` to leave
 * it out (Durable Object SQLite lives inside each object, not in the app).
 * The target's `platform` provides it; {@link databases} uses it.
 */
export class DbConnector extends Context.Service<
	DbConnector,
	(db: Unchecked<ManifestDb>) => Effect.Effect<DbConnection, unknown, Scope.Scope> | undefined
>()("spacefn/DbConnector") {}

const exportError = (code: string, file: string, message: string, hint: string) =>
	new SpaceError({ code, file, message, hint });

const defaultOf = (entry: { readonly module: unknown }) =>
	(entry.module as { default?: unknown }).default;

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
			// A `manual` database is the app's to open, as for a database per tenant.
			for (const entry of manifest.db.filter((db) => db.open !== "manual")) {
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
