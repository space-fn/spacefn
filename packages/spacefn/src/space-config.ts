import { Schema } from "effect";

/** Where the app runs. Decides the generated entry, the db drivers allowed and the infra. */
export const Target = Schema.Literals(["cloudflare", "bun"]);
export type Target = typeof Target.Type;

/**
 * How a database in `app/db/<name>/` is reached, from its `config.json`.
 * `durable-object` is SQLite inside each Durable Object instance (Cloudflare only).
 */
export const DbDriver = Schema.Literals(["d1", "durable-object", "libsql"]);
export type DbDriver = typeof DbDriver.Type;

/** The shape of `configs/space.ts`. */
export const SpaceConfig = Schema.Struct({
	target: Target,
	/** App name, used for Worker and container names. Defaults to package.json `name`. */
	name: Schema.optional(
		Schema.String.check(
			Schema.isPattern(/^[a-z][a-z0-9-]*$/, { message: "Use lowercase letters, digits and -" }),
		),
	),
});
export type SpaceConfig = typeof SpaceConfig.Type;

/** `configs/space.ts` after defaults are applied. */
export interface ResolvedSpaceConfig {
	readonly target: Target;
	readonly name: string;
	/**
	 * Folders `package.json` `imports` maps, e.g. `lib` for `"#lib/*": "./lib/*"`
	 * (`.space` aside). Read with `app/` where all the app's code is wanted.
	 */
	readonly folders: readonly string[];
}

/**
 * Declares the framework settings in `configs/space.ts`.
 *
 * ```ts
 * export default defineSpace({ target: "cloudflare" });
 * ```
 */
export const defineSpace = (config: SpaceConfig): SpaceConfig => config;
