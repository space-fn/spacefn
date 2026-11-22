import { Redacted } from "effect";
import { envVariables } from "spacefn/internal/runtime";

/** `configs/env.ts`'s default export: its fields say which variables the app reads. */
export interface EnvSource {
	readonly fields: Readonly<Record<string, unknown>>;
}

/** Variables by name, each `"plain"` or `"secret"`. */
export type VariableList = Readonly<Record<string, "plain" | "secret">>;

/**
 * The values a deploy passes to the app, read from this process's environment
 * (`space deploy` loads `.env.<stage>`): `configs/env.ts`'s fields, or the
 * variables listed. Secrets come back `Redacted` (Worker secrets on
 * Cloudflare). Unset ones are left out; the app names them when it fails to start.
 *
 * ```ts
 * env: { ...variables(env), ...variables({ OTEL_EXPORTER_OTLP_HEADERS: "secret" }) }
 * ```
 */
export const variables = (
	from: EnvSource | VariableList,
	environment: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string | Redacted.Redacted<string>> => {
	const wanted =
		"fields" in from && typeof from.fields === "object"
			? envVariables(from as Parameters<typeof envVariables>[0])
			: Object.entries(from as VariableList).map(([name, kind]) => ({
					name,
					secret: kind === "secret",
				}));
	const values: Record<string, string | Redacted.Redacted<string>> = {};
	for (const { name, secret } of wanted) {
		const value = environment[name];
		if (value !== undefined) values[name] = secret ? Redacted.make(value) : value;
	}
	return values;
};
