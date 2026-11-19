import { Schema } from "effect";

/** Where the app runs. Decides the generated entry, the db drivers allowed and the infra. */
export const Target = Schema.Literals(["cloudflare", "bun"]);
export type Target = typeof Target.Type;

/**
 * How a database in `app/db/<name>/` is reached. `durable-object` is SQLite
 * inside each Durable Object instance (Cloudflare only).
 */
export const DbDriver = Schema.Literals(["d1", "durable-object", "libsql"]);
export type DbDriver = typeof DbDriver.Type;

/** The driver a database gets when `configs/space.ts` does not name one. */
export const DEFAULT_DB_DRIVER: Readonly<Record<Target, DbDriver>> = {
	cloudflare: "d1",
	bun: "libsql",
};

const ALIAS = /^@[\w-]+$/;

const Aliases = Schema.Record(Schema.String, Schema.String).check(
	Schema.makeFilter((aliases) => {
		const bad = Object.keys(aliases).filter((name) => !ALIAS.test(name));
		if (bad.length) return `Alias names start with @, e.g. @modules (got ${bad.join(", ")})`;
		return !("@space" in aliases) || "@space is reserved for generated code (.space/)";
	}),
);

/** The shape of `configs/space.ts`. */
export const SpaceConfig = Schema.Struct({
	target: Target,
	/** App name, used for Worker and container names. Defaults to package.json `name`. */
	name: Schema.optional(
		Schema.String.check(
			Schema.isPattern(/^[a-z][a-z0-9-]*$/, { message: "Use lowercase letters, digits and -" }),
		),
	),
	/** Import aliases, alias → folder relative to the app root. */
	aliases: Schema.optional(Aliases),
	/** Driver per database folder, e.g. `{ main: "d1", rooms: "durable-object" }`. */
	db: Schema.optional(Schema.Record(Schema.String, DbDriver)),
});
export type SpaceConfig = typeof SpaceConfig.Type;

/** `configs/space.ts` after defaults are applied. */
export interface ResolvedSpaceConfig {
	readonly target: Target;
	readonly name: string;
	readonly aliases: Readonly<Record<string, string>>;
	/** Drivers named in the config. Folders not listed get {@link DEFAULT_DB_DRIVER}. */
	readonly db: Readonly<Record<string, DbDriver>>;
}

export const DEFAULT_ALIASES: Readonly<Record<string, string>> = {
	"@modules": "modules",
	"@lib": "lib",
	"@utils": "utils",
};

/**
 * Declares the framework settings in `configs/space.ts`.
 *
 * ```ts
 * export default defineSpace({ target: "cloudflare" });
 * ```
 */
export const defineSpace = (config: SpaceConfig): SpaceConfig => config;
