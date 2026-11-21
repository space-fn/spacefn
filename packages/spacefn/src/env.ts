import { Config, Context, Effect, Layer, Option, type Redacted, type Schema } from "effect";

import { SpaceError } from "./errors.ts";

/** One env variable: given its name, how to read it. */
export type EnvField<A> = (name: string) => Config.Config<A>;

type Options<A> = { readonly default?: A; readonly optional?: boolean };
type Read<A, O> = O extends { readonly optional: true } ? A | undefined : A;

const field =
	<A>(read: (name: string) => Config.Config<A>) =>
	<const O extends Options<A> = {}>(options?: O): EnvField<Read<A, O>> =>
	(name) => {
		const config = read(name);
		if (options?.default !== undefined)
			return Config.withDefault(config, options.default) as Config.Config<Read<A, O>>;
		if (options?.optional)
			return config.pipe(Config.option, Config.map(Option.getOrUndefined)) as Config.Config<
				Read<A, O>
			>;
		return config as Config.Config<Read<A, O>>;
	};

const SECRET = "~spacefn/secret";

/** Field types for {@link defineEnv}. Each reads the variable of the same name. */
export const Env = {
	string: field(Config.String),
	number: field(Config.Number),
	int: field(Config.Int),
	boolean: field(Config.Boolean),
	url: field(Config.URL),
	/** A secret: its value is `Redacted`, so it never shows up in logs or errors. */
	secret: <const O extends { readonly optional?: boolean } = {}>(
		options?: O,
	): EnvField<Read<Redacted.Redacted<string>, O>> =>
		Object.assign(field(Config.Redacted)(options), { [SECRET]: true }),
	/** Any Effect Schema that decodes from the variable's string value. */
	schema: <A>(schema: Schema.ConstraintCodec<A, unknown>, options?: Options<A>): EnvField<A> =>
		field<A>((name) => Config.schema(schema, name))(options) as EnvField<A>,
} as const;

export type EnvShape<Fields extends Record<string, EnvField<any>>> = {
	readonly [K in keyof Fields]: Fields[K] extends EnvField<infer A> ? A : never;
};

/**
 * Declares the app's env (`configs/env.ts`) and returns its service. Values come from
 * the target's ConfigProvider: Worker vars and secrets on Cloudflare, process env
 * on Bun, `testEnv` in tests. A missing or invalid value fails at boot with a
 * SpaceError naming the variable.
 *
 * ```ts
 * export default defineEnv({ GREETING: Env.string({ default: "hi" }), API_KEY: Env.secret() });
 * ```
 */
/** Type-level identity of the app env service. An app has exactly one `configs/env.ts`. */
export interface AppEnvId {
	readonly "~spacefn/AppEnv": true;
}

/** What {@link defineEnv} returns: the env service plus its fields, Config and Layer. */
export type AppEnv<Fields extends Record<string, EnvField<any>>> = Context.Service<
	AppEnvId,
	EnvShape<Fields>
> & {
	readonly fields: Fields;
	readonly config: Config.Config<EnvShape<Fields>>;
	readonly layer: Layer.Layer<AppEnvId, SpaceError>;
};

/**
 * Declares the app's env (`configs/env.ts`) and returns its service. Values come from
 * the target's ConfigProvider: Worker vars and secrets on Cloudflare, process env
 * on Bun, `testEnv` in tests. A missing or invalid value fails at boot with a
 * SpaceError naming the variable.
 *
 * ```ts
 * export default defineEnv({ GREETING: Env.string({ default: "hi" }), API_KEY: Env.secret() });
 * ```
 */
export const defineEnv = <const Fields extends Record<string, EnvField<any>>>(
	fields: Fields,
): AppEnv<Fields> => {
	type Shape = EnvShape<Fields>;
	const AppEnv = Context.Service<AppEnvId, Shape>("spacefn/Env");
	const config = Config.all(
		Object.fromEntries(Object.entries(fields).map(([name, read]) => [name, read(name)])),
	) as unknown as Config.Config<Shape>;
	const layer = Layer.effect(
		AppEnv,
		Effect.gen(function* () {
			return yield* config;
		}).pipe(
			Effect.mapError(
				(cause) =>
					new SpaceError({
						code: "ENV_INVALID",
						message: `Invalid environment: ${cause.message}`,
						file: "configs/env.ts",
						hint: "Set the variable (Worker vars/secrets on Cloudflare, process env on Bun) or give the field a default.",
					}),
			),
		),
	);
	return Object.assign(AppEnv, { fields, config, layer });
};

/**
 * The variables an app env reads, and which are secrets: what a deploy passes
 * to the target (secrets as Worker secrets on Cloudflare).
 */
export const envVariables = (env: {
	readonly fields: Readonly<Record<string, EnvField<any>>>;
}): ReadonlyArray<{ readonly name: string; readonly secret: boolean }> =>
	Object.entries(env.fields).map(([name, read]) => ({
		name,
		secret: (read as { readonly [SECRET]?: boolean })[SECRET] === true,
	}));
