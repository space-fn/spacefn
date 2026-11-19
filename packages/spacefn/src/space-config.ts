import { Schema } from "effect";

/** Where the app runs. Decides the generated entry, the db drivers allowed and the infra. */
export const Target = Schema.Literals(["cloudflare", "bun"]);
export type Target = typeof Target.Type;

const ALIAS = /^@[\w-]+$/;

const Aliases = Schema.Record(Schema.String, Schema.String).check(
	Schema.makeFilter((aliases) => {
		const bad = Object.keys(aliases).filter((name) => !ALIAS.test(name));
		return bad.length === 0 || `Alias names start with @, e.g. @modules (got ${bad.join(", ")})`;
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
});
export type SpaceConfig = typeof SpaceConfig.Type;

/** `configs/space.ts` after defaults are applied. */
export interface ResolvedSpaceConfig {
	readonly target: Target;
	readonly name: string;
	readonly aliases: Readonly<Record<string, string>>;
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
