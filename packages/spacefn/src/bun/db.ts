import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { createClient } from "@libsql/client";
import { Config, Effect, Option, Redacted, type Scope } from "effect";
import { SpaceError, type ManifestDb } from "spacefn";
import { libsqlConnection, type DbConnection, type Unchecked } from "spacefn/internal/runtime";

/** Where local files go: `file:` databases, the state database and blobs. */
export const dataDir = Config.String("SPACE_DATA_DIR").pipe(Config.withDefault(".space/data"));

/** How long a write waits for another process to release the lock of a `file:` database. */
const BUSY_TIMEOUT_MS = 5_000;

const connectError = (url: string, cause: unknown) =>
	new SpaceError({
		code: "DB_CONNECT",
		message: `Can't open ${url.startsWith("file:") ? url : "the libSQL database"}: ${String(cause)}`,
		hint: "Check the URL and auth token, or that the directory is writable.",
	});

/**
 * A libSQL database on the native client: a local `file:` database or a remote
 * one (`libsql://`, `https://`). A file is put in WAL mode, so the web, queue
 * and cron processes can use it at once, each waiting its turn to write.
 */
export const libsqlDatabase = (options: {
	readonly url: string;
	readonly authToken?: Redacted.Redacted | undefined;
}): Effect.Effect<DbConnection, SpaceError, Scope.Scope> =>
	Effect.acquireRelease(
		Effect.tryPromise({
			try: async () => {
				const local = options.url.startsWith("file:");
				if (local) await mkdir(dirname(options.url.slice("file:".length)), { recursive: true });
				const client = createClient({
					url: options.url,
					timeout: BUSY_TIMEOUT_MS,
					...(options.authToken ? { authToken: Redacted.value(options.authToken) } : {}),
				});
				if (local) {
					await client.execute("PRAGMA journal_mode = WAL");
					await client.execute("PRAGMA synchronous = NORMAL");
				}
				return client;
			},
			catch: (cause) => connectError(options.url, cause),
		}),
		(client) => Effect.sync(() => client.close()),
	).pipe(Effect.flatMap(libsqlConnection));

/**
 * A libSQL database configured by `<BINDING>_URL` and an optional
 * `<BINDING>_AUTH_TOKEN`; without a URL, `file:<SPACE_DATA_DIR>/<file>.db`.
 */
export const libsqlFromConfig = (
	binding: string,
	file: string,
): Effect.Effect<DbConnection, SpaceError | Config.ConfigError, Scope.Scope> =>
	Effect.gen(function* () {
		const dir = yield* dataDir;
		const url = yield* Config.String(`${binding}_URL`).pipe(
			Config.withDefault(`file:${dir}/${file}.db`),
		);
		const authToken = yield* Config.Redacted(`${binding}_AUTH_TOKEN`).pipe(Config.option);
		return yield* libsqlDatabase({ url, authToken: Option.getOrUndefined(authToken) });
	});

/** How the Bun target reaches each database of the manifest. Only libSQL runs here. */
export const connect = (
	db: Unchecked<ManifestDb>,
): Effect.Effect<DbConnection, unknown, Scope.Scope> =>
	db.driver === "libsql"
		? libsqlFromConfig(db.binding, db.name)
		: Effect.fail(
				new SpaceError({
					code: "DB_DRIVER",
					message: `Database ${db.name} uses ${db.driver}, which only runs on Cloudflare`,
					hint: 'Use driver: "libsql" for the Bun target.',
				}),
			);
