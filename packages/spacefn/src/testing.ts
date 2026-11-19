import { ConfigProvider, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";

import { httpLayer } from "./http/app.ts";
import type { ManifestMiddleware, ManifestRoute, Unchecked } from "./manifest.ts";
import { Blob } from "./services/blob.ts";
import { Bus } from "./services/bus.ts";
import { Kv } from "./services/kv.ts";
import { Queue, QueueInbox } from "./services/queue.ts";

export { QueueInbox, type QueueInboxShape, type SentMessage } from "./services/queue.ts";

/** Every runtime service backed by memory. Each build starts empty, so tests don't share state. */
export const memoryServices: Layer.Layer<Blob | Bus | Kv | Queue | QueueInbox> = Layer.mergeAll(
	Blob.memory,
	Bus.memory,
	Kv.memory,
	Queue.memory,
);

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
