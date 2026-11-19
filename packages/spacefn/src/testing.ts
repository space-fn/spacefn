import { ConfigProvider, Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { Reactivity } from "effect/reactivity";
import type { SqlError } from "effect/sql";

import { transactional } from "./db/connection.ts";
import type { DatabaseStatics } from "./db/database.ts";
import type { MigrationError } from "./db/migrate.ts";
import { httpLayer } from "./http/app.ts";
import type { ManifestMiddleware, ManifestRoute, Unchecked } from "./manifest.ts";
import { Blob } from "./services/blob.ts";
import { Bus } from "./services/bus.ts";
import { Kv } from "./services/kv.ts";
import { Queue, QueueInbox } from "./services/queue.ts";
import { RateLimiter } from "./services/rate-limiter.ts";

export { QueueInbox, type QueueInboxShape, type SentMessage } from "./services/queue.ts";

/** Every runtime service backed by memory. Each build starts empty, so tests don't share state. */
export const memoryServices: Layer.Layer<Blob | Bus | Kv | Queue | QueueInbox | RateLimiter> =
	Layer.mergeAll(Blob.memory, Bus.memory, Kv.memory, Queue.memory, RateLimiter.memory);

/** Env values for `defineEnv` in tests: `Effect.provide(AppEnv.layer.pipe(Layer.provide(testEnv({ API_KEY: "x" }))))`. */
export const testEnv = (values: Record<string, unknown>): Layer.Layer<never> =>
	ConfigProvider.layer(ConfigProvider.fromUnknown(values));

export interface TestHttp {
	/** Sends a request to the app. A path is resolved against `http://app.test`. */
	readonly fetch: (input: string | Request, init?: RequestInit) => Promise<Response>;
	readonly dispose: () => Promise<void>;
}

/**
 * Serves routes and middleware in memory, with `services` (for example
 * `memoryServices`) provided to both, the way a target serves the app.
 *
 * ```ts
 * const app = testHttp({ routes: [todosRoute] }, memoryServices);
 * const response = await app.fetch("/todos");
 * ```
 */
export const testHttp = <E>(
	manifest: {
		readonly routes?: readonly Unchecked<ManifestRoute>[];
		readonly middleware?: readonly Unchecked<ManifestMiddleware>[];
	},
	services?: Layer.Layer<any, E>,
): TestHttp => {
	const app = HttpRouter.toWebHandler(
		httpLayer(
			{ routes: manifest.routes ?? [], middleware: manifest.middleware ?? [] },
			services,
		).pipe(Layer.provide(HttpServer.layerServices)),
		{ disableLogger: true },
	);
	return {
		fetch: (input, init) =>
			app.handler(
				typeof input === "string" ? new Request(new URL(input, "http://app.test"), init) : input,
			),
		dispose: app.dispose,
	};
};

/**
 * A fresh in-memory SQLite database for a generated database class, with every
 * migration applied. Each build starts empty.
 *
 * ```ts
 * import { MainDb } from "@space/db/main.ts";
 * it.effect("adds a todo", () => addTodo("x").pipe(Effect.provide(testDb(MainDb))));
 * ```
 *
 * Runs on Node's built-in `node:sqlite`, loaded only when the layer builds.
 */
export const testDb = <Self>(
	db: DatabaseStatics<Self>,
): Layer.Layer<Self, SqlError.SqlError | MigrationError> =>
	db.layer(
		Effect.gen(function* () {
			const { SqliteClient } = yield* Effect.promise(() => import("@effect/sql-sqlite-node"));
			const sql = yield* SqliteClient.make({ filename: ":memory:" }).pipe(
				Effect.provide(Reactivity.layer),
			);
			return transactional(sql);
		}),
	);
