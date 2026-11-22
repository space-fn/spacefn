import { Schema } from "effect";

/**
 * Where the app runs: the `target` of the spacefn plugin in `configs/vite.ts`.
 * Decides the generated entry, the db drivers allowed and the infra.
 */
export const Target = Schema.Literals(["cloudflare", "bun"]);
export type Target = typeof Target.Type;

/**
 * How a database in `app/db/<name>/` is reached, from its `config.json`.
 * `durable-object` is SQLite inside each Durable Object instance (Cloudflare only).
 */
export const DbDriver = Schema.Literals(["d1", "durable-object", "libsql"]);
export type DbDriver = typeof DbDriver.Type;

/** What codegen knows about the app besides `app/`: its target and what `package.json` says. */
export interface AppConfig {
	readonly target: Target;
	/** `package.json` `name` without its scope; names the Worker, the container and the deploy. */
	readonly name: string;
	/**
	 * Folders `package.json` `imports` maps, e.g. `lib` for `"#lib/*": "./lib/*"`
	 * (`.space` aside). Read with `app/` where all the app's code is wanted.
	 */
	readonly folders: readonly string[];
	/** `package.json` `dependencies` and `devDependencies` names: which framework a `.tsx` island is. */
	readonly packages: readonly string[];
}
