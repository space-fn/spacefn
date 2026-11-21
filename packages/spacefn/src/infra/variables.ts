import { Redacted } from "effect";
import { envVariables } from "spacefn/runtime";

export interface VariableSources {
	/** `configs/env.ts`'s default export, if the app has one. */
	readonly env?: { readonly fields: Readonly<Record<string, unknown>> } | undefined;
	/** libSQL databases, whose `<BINDING>_URL` and `<BINDING>_AUTH_TOKEN` the app reads. */
	readonly libsql: readonly string[];
}

/**
 * The variables a deploy passes to the app, from this process's environment
 * (the CLI loads `.env` files): `configs/env.ts`'s fields, libSQL URLs and tokens,
 * and `OTEL_*`. Secrets come back `Redacted` (Worker secrets on Cloudflare).
 * Unset ones are left out; the app names them when it fails to start.
 */
export const deployVariables = (
	sources: VariableSources,
	environment: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string | Redacted.Redacted<string>> => {
	const wanted: { name: string; secret: boolean }[] = [];
	if (sources.env) wanted.push(...envVariables(sources.env as Parameters<typeof envVariables>[0]));
	for (const binding of sources.libsql)
		wanted.push(
			{ name: `${binding}_URL`, secret: false },
			{ name: `${binding}_AUTH_TOKEN`, secret: true },
		);
	for (const name of Object.keys(environment))
		if (name.startsWith("OTEL_"))
			wanted.push({ name, secret: name === "OTEL_EXPORTER_OTLP_HEADERS" });
	const variables: Record<string, string | Redacted.Redacted<string>> = {};
	for (const { name, secret } of wanted) {
		const value = environment[name];
		if (value !== undefined) variables[name] = secret ? Redacted.make(value) : value;
	}
	return variables;
};
