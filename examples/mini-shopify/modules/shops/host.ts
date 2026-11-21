import { createClient } from "@tursodatabase/api";
import { Context, Data, Effect, Layer, Redacted } from "effect";
import { dataDir, libsqlDatabase } from "spacefn/bun";

import Env from "#configs/env.ts";

export class HostError extends Data.TaggedError("HostError")<{
	readonly message: string;
	readonly cause: unknown;
}> {}

/** Where the shops' databases live: Turso, or local files. */
export class DatabaseHost extends Context.Service<
	DatabaseHost,
	{
		/** Creates the database `name`, and gives its URL. */
		readonly create: (name: string) => Effect.Effect<string, HostError>;
		/** Opens the database at `url`, until the scope closes. */
		readonly open: (url: string) => ReturnType<typeof libsqlDatabase>;
	}
>()("mini-shopify/DatabaseHost") {}

/** Each database a file in `dir`, opened with the native libSQL client. */
export const localHost = (dir: string) =>
	Layer.succeed(DatabaseHost)({
		create: (name) => Effect.succeed(`file:${dir}/${name}.db`),
		open: (url) => libsqlDatabase({ url }),
	});

/**
 * Each database created in a Turso group with the Platform API, and opened
 * with the group's token: one token for every shop, so the platform database
 * stores no secrets.
 */
export const tursoHost = (options: {
	readonly org: string;
	readonly apiToken: Redacted.Redacted<string>;
	readonly group: string;
	readonly groupToken: Redacted.Redacted<string>;
}) => {
	const turso = createClient({
		org: options.org,
		token: async () => Redacted.value(options.apiToken),
	});
	return Layer.succeed(DatabaseHost)({
		create: (name) =>
			Effect.tryPromise({
				try: () => turso.databases.create(name, { group: options.group }),
				catch: (cause) => new HostError({ message: `Turso didn't create ${name}`, cause }),
			}).pipe(Effect.map((db) => `libsql://${db.hostname}`)),
		open: (url) => libsqlDatabase({ url, authToken: options.groupToken }),
	});
};

/** Turso when `TURSO_API_TOKEN` is set, else local files under the data folder. */
export const hostLayer = Layer.unwrap(
	Effect.gen(function* () {
		const env = yield* Env;
		if (!env.TURSO_API_TOKEN) return localHost(`${yield* dataDir}/shops`);
		if (!env.TURSO_ORG || !env.TURSO_GROUP_TOKEN)
			return yield* Effect.die(
				new Error("With TURSO_API_TOKEN, set TURSO_ORG and TURSO_GROUP_TOKEN too"),
			);
		return tursoHost({
			org: env.TURSO_ORG,
			apiToken: env.TURSO_API_TOKEN,
			group: env.TURSO_GROUP,
			groupToken: env.TURSO_GROUP_TOKEN,
		});
	}),
);
