import { LibsqlClient } from "@effect/sql-libsql";
import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client/web";
import { Config, Effect, Option, Redacted, type Scope } from "effect";
import { Reactivity } from "effect/reactivity";

import { transactional, type DbConnection } from "./connection.ts";

/** A connection on a libSQL client the caller owns, for example a local one in tests. */
export const libsqlConnection = (client: Client): Effect.Effect<DbConnection, never, Scope.Scope> =>
	LibsqlClient.make({ liveClient: client }).pipe(
		Effect.map(transactional),
		Effect.provide(Reactivity.layer),
	);

export interface LibsqlOptions {
	/** `libsql://`, `https://` or `wss://`: Turso, sqld, or `turso dev`. */
	readonly url: string;
	readonly authToken?: Redacted.Redacted | undefined;
}

/**
 * A libSQL database over HTTP. It uses the fetch-only client, so it runs the
 * same everywhere; Bun opens `file:` databases with the native client instead.
 * Closed when the scope closes.
 */
export const libsql = (options: LibsqlOptions): Effect.Effect<DbConnection, never, Scope.Scope> =>
	Effect.acquireRelease(
		Effect.sync(() =>
			createClient({
				url: options.url,
				...(options.authToken ? { authToken: Redacted.value(options.authToken) } : {}),
			}),
		),
		(client) => Effect.sync(() => client.close()),
	).pipe(Effect.flatMap((client) => libsqlConnection(client as Client)));

/**
 * A libSQL database configured by `<BINDING>_URL` and an optional
 * `<BINDING>_AUTH_TOKEN`, e.g. `DB_MAIN_URL` for the `main` database.
 */
export const libsqlFromConfig = (
	binding: string,
): Effect.Effect<DbConnection, Config.ConfigError, Scope.Scope> =>
	Effect.gen(function* () {
		const url = yield* Config.String(`${binding}_URL`);
		const authToken = yield* Config.Redacted(`${binding}_AUTH_TOKEN`).pipe(Config.option);
		return yield* libsql({ url, authToken: Option.getOrUndefined(authToken) });
	});
