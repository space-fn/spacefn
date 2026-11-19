/**
 * The contract between generated code and the target packages. `space gen`
 * writes `.space/manifest.ts` as a value of this type; `@spacefn/cloudflare`
 * and `@spacefn/bun` turn it into a running app. Module types make a wrong
 * export a type error in the generated file, so the editor flags it.
 */
import type { DatabaseClass } from "./db/database.ts";
import type { Middleware } from "./http/middleware.ts";
import type { Route } from "./http/route.ts";
import type { Page } from "./pages/page.ts";
import type { DbDriver } from "./space-config.ts";

interface ManifestRouteBase {
	/** Path for Effect's `HttpRouter`, e.g. `/users/:id` or `/files/*`. */
	readonly path: `/${string}`;
	readonly params: readonly string[];
	/** Name of the catch-all parameter, which the router reports as `*`. */
	readonly catchAll?: string;
	/** Source file from the app root, for error messages. */
	readonly file: string;
}

/** A file in `app/routes/`: its default export is a `route()`. */
export interface ManifestApiRoute extends ManifestRouteBase {
	readonly kind: "route";
	readonly module: { readonly default: Route };
}

/** A file in `app/pages/`: its default export is a `page()`. */
export interface ManifestPage extends ManifestRouteBase {
	readonly kind: "page";
	readonly module: { readonly default: Page };
}

export type ManifestRoute = ManifestApiRoute | ManifestPage;

export interface ManifestModule {
	readonly file: string;
	readonly module: unknown;
}

export interface ManifestMiddleware {
	readonly file: string;
	readonly module: { readonly default: Middleware };
}

export interface ManifestNamed extends ManifestModule {
	readonly name: string;
}

export interface ManifestBound extends ManifestNamed {
	readonly binding: string;
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
	readonly env?: ManifestModule;
	readonly layers?: ManifestModule;
	readonly routes: readonly ManifestRoute[];
	/** In run order; each default-exports a `middleware()`. */
	readonly middleware: readonly ManifestMiddleware[];
	readonly queues: readonly ManifestBound[];
	readonly crons: readonly ManifestNamed[];
	readonly db: readonly ManifestDb[];
}
