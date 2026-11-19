/**
 * The contract between generated code and the target packages. `space gen`
 * writes `.space/manifest.ts` as a value of this type; `@spacefn/cloudflare`
 * and `@spacefn/bun` turn it into a running app. Modules stay `unknown` here:
 * the HTTP, queue, cron and db steps give them their real types.
 */
import type { DbDriver } from "./space-config.ts";

export interface ManifestRoute {
	readonly kind: "route" | "page";
	/** Path for Effect's `HttpRouter`, e.g. `/users/:id` or `/files/*`. */
	readonly path: `/${string}`;
	readonly params: readonly string[];
	/** Name of the catch-all parameter, which the router reports as `*`. */
	readonly catchAll?: string;
	/** Source file from the app root, for error messages. */
	readonly file: string;
	readonly module: unknown;
}

export interface ManifestModule {
	readonly file: string;
	readonly module: unknown;
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
	/** The generated `.space/db/<name>.ts` module. */
	readonly module: unknown;
}

export interface SpaceManifest {
	readonly name: string;
	readonly env?: ManifestModule;
	readonly layers?: ManifestModule;
	readonly routes: readonly ManifestRoute[];
	/** In run order. */
	readonly middleware: readonly ManifestModule[];
	readonly queues: readonly ManifestBound[];
	readonly crons: readonly ManifestNamed[];
	readonly db: readonly ManifestDb[];
}
