/**
 * The target's services, for `app/entry.ts`: Kv, Blob, Queue, Bus,
 * RateLimiter, an `HttpClient` and how databases connect.
 *
 * ```ts
 * import { platform } from "spacefn/platform";
 * export default app(manifest, { services: [platform(manifest), ...] });
 * ```
 *
 * The spacefn Vite plugin replaces this module with the `platform` of
 * `spacefn/cloudflare` or `spacefn/bun`, by the `target` in `configs/vite.ts`,
 * so the entry is the same file on both. This file only runs when the plugin
 * is missing.
 */
import type { Layer } from "effect";
import type { HttpClient } from "effect/http";

import type { DbConnector } from "./app-layer.ts";
import type { SpaceManifest } from "./manifest.ts";
import type { Blob } from "./services/blob.ts";
import type { Bus } from "./services/bus.ts";
import type { Kv } from "./services/kv.ts";
import type { Queue } from "./services/queue.ts";
import type { RateLimiter } from "./services/rate-limiter.ts";

/** What every target's platform provides. */
export type PlatformServices =
	| Kv
	| Blob
	| Queue
	| Bus
	| RateLimiter
	| HttpClient.HttpClient
	| DbConnector;

export const platform = (
	_manifest: Pick<SpaceManifest, "queues">,
): Layer.Layer<PlatformServices> => {
	throw new Error(
		'spacefn/platform is provided by the spacefn Vite plugin: add plugins: [space({ target })] from "spacefn/vite" to the Vite config',
	);
};
