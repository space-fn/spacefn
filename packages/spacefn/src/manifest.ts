/**
 * The contract between generated code and the target packages. `space gen`
 * writes `.space/manifest.ts` as a value of this type; `spacefn/cloudflare`
 * and `spacefn/bun` turn it into a running app. Module types make a wrong
 * export a type error in the generated file, so the editor flags it.
 */
import type { Layer } from "effect";

import type { DbDriver } from "./app-config.ts";
import type { DatabaseClass } from "./db/database.ts";
import type { AppEnv } from "./env.ts";
import type { Middleware } from "./http/middleware.ts";
import type { Route } from "./http/route.ts";
import type { Cron } from "./jobs/cron.ts";
import type { QueueConsumer } from "./jobs/queue.ts";
import type { Page } from "./pages/page.ts";

interface ManifestRouteBase {
	/** Path for Effect's `HttpRouter`, e.g. `/users/:id` or `/files/*`. */
	readonly path: `/${string}`;
	readonly params: readonly string[];
	/** Name of the catch-all parameter, which the router reports as `*`. */
	readonly catchAll?: string;
	/** Source file from the app root, for error messages. */
	readonly file: string;
}

/** A file in `app/routes/`: its default export is a `route()` or a `page()`, which decides how it is served. */
export interface ManifestRoute extends ManifestRouteBase {
	readonly module: { readonly default: Route | Page };
}

export interface ManifestModule {
	readonly file: string;
	readonly module: unknown;
}

/**
 * A `_middleware.ts` in `app/routes/` or a folder below it: one `middleware()`
 * or an array of them, the first outermost. The root one wraps every request;
 * a deeper one wraps the routes and pages in its folder.
 */
export interface ManifestMiddleware {
	/** The folder it covers, from the app root, e.g. `app/routes/admin`. */
	readonly folder: string;
	readonly file: string;
	readonly module: { readonly default: Middleware | readonly Middleware[] };
}

/** A file in `app/queues/`: its default export is a `queue()` consumer. */
export interface ManifestQueue {
	readonly name: string;
	/** The producer binding, e.g. `QUEUE_EMAILS`. */
	readonly binding: string;
	readonly file: string;
	readonly module: { readonly default: QueueConsumer };
}

/** A file in `app/crons/`: its default export is a `cron()` job. */
export interface ManifestCron {
	readonly name: string;
	readonly file: string;
	readonly module: { readonly default: Cron };
}

/** `app/layers.ts`: its default export is a Layer with the app's own services. */
export interface ManifestLayers {
	readonly file: string;
	readonly module: { readonly default: Layer.Any };
}

/** `configs/env.ts`: its default export is the `defineEnv()` service. */
export interface ManifestEnv {
	readonly file: string;
	readonly module: { readonly default: AppEnv<any> };
}

export interface ManifestDb {
	readonly name: string;
	readonly driver: DbDriver;
	readonly binding: string;
	/** The generated `.space/db/<name>.ts` module; its default export is the database class. */
	readonly module: { readonly default: DatabaseClass };
}

/**
 * An entry whose module has not been checked yet. The runtime accepts these and
 * checks each export itself, since plain JS or a cast can get past the types.
 */
export type Unchecked<T extends { readonly module: unknown }> = T extends unknown
	? Omit<T, "module"> & { readonly module: unknown }
	: never;

export interface SpaceManifest {
	readonly name: string;
	readonly env?: ManifestEnv;
	readonly layers?: ManifestLayers;
	readonly routes: readonly ManifestRoute[];
	/** Outer folders first. */
	readonly middleware: readonly ManifestMiddleware[];
	readonly queues: readonly ManifestQueue[];
	readonly crons: readonly ManifestCron[];
	readonly db: readonly ManifestDb[];
}
