import { Layer } from "effect";

import type { Middleware } from "./http/middleware.ts";
import { OnError, type ErrorHandler } from "./http/respond.ts";
import type { SpaceManifest } from "./manifest.ts";

/** Options only the Bun target reads. */
export interface BunOptions {
	/** Default `PORT`, else 3000. */
	readonly port?: number;
	/** Default `HOST`, else every interface. */
	readonly hostname?: string;
	/** Seconds a connection may idle. Default 60, above live pages' 15s keepalive. */
	readonly idleTimeout?: number;
}

/** Options only the Cloudflare target reads. */
export interface CloudflareOptions {
	/**
	 * More Worker handlers, beside the `fetch`, `queue` and `scheduled` that
	 * spacefn makes: `email`, `tail`, ... Each gets the Worker's own arguments.
	 */
	readonly handlers?: Readonly<Record<string, (...args: any[]) => unknown>>;
}

export interface AppOptions {
	/**
	 * The app's services, in order: each layer can use the ones before it, and
	 * routes, pages, queues and crons can use them all. Start with the target's
	 * `platform`, then the env, the databases, telemetry and your own.
	 */
	readonly services?: readonly Layer.Any[];
	/** Middleware around every request, outside `app/routes/_middleware.ts`: `staticFiles()`, ... */
	readonly before?: readonly Middleware[];
	/** Effect `HttpRouter` layers beside the file routes, e.g. an `HttpApi`. */
	readonly routes?: readonly Layer.Any[];
	/** What a failed request answers with. Default `errorPage`. */
	readonly onError?: ErrorHandler;
	readonly bun?: BunOptions;
	readonly cloudflare?: CloudflareOptions;
}

/** The app as `app/entry.ts` describes it, for a target to run. */
export interface SpaceApp {
	readonly manifest: SpaceManifest;
	readonly options: AppOptions;
}

/**
 * Describes the app, in `app/entry.ts`: the file conventions (`manifest`)
 * and what runs with them. The generated Worker or Bun server runs it.
 *
 * ```ts
 * export default app(manifest, {
 *   services: [platform, Env.layer, databases(manifest), telemetry(manifest.name)],
 *   before: [staticFiles()],
 *   onError: errorPage,
 * });
 * ```
 */
export const app = (manifest: SpaceManifest, options: AppOptions = {}): SpaceApp => ({
	manifest,
	options,
});

/** The app's services as one layer, each with the ones before it, and its `onError`. */
export const appServices = (app: SpaceApp): Layer.Layer<any, unknown, any> => {
	let services = Layer.empty as Layer.Any as Layer.Layer<any, unknown, any>;
	for (const layer of app.options.services ?? [])
		services = Layer.provideMerge(layer as Layer.Layer<any, unknown, any>, services);
	return app.options.onError
		? Layer.merge(services, Layer.succeed(OnError, app.options.onError))
		: services;
};
