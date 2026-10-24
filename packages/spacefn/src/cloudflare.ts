import { bindings, type WorkerConfig } from "cf/config";

import type { Schema } from "./env/fields";

type EnvBindings = NonNullable<WorkerConfig["env"]>;

/**
 * Derives Cloudflare bindings from an `env.ts` schema: fields with a default
 * become text bindings, every other field becomes a secret binding.
 */
export function envBindings(schema: Schema): EnvBindings {
	const result: EnvBindings = {};
	for (const [key, field] of Object.entries(schema)) {
		result[key] =
			!field.secret && field.default !== undefined
				? bindings.text(String(field.default))
				: bindings.secret();
	}
	return result;
}
