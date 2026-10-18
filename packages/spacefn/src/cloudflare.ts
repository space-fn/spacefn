import { bindings, type CloudflareConfig, type WorkerConfig } from "cf/config";

import type { Schema } from "./env/fields";

export type SpaceWorkerConfig = Omit<WorkerConfig, "entrypoint"> & {
	/** Defaults to the generated `.space/worker.ts`. */
	entrypoint?: WorkerConfig["entrypoint"];
};

export const DEFAULT_ENTRYPOINT = "./app/entry.ts";

type EnvBindings = NonNullable<WorkerConfig["env"]>;

/**
 * Fields with a default become text bindings. Every other field becomes a
 * secret binding, because the runtime only exposes declared bindings.
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

/**
 * Today's date as `YYYY-MM-DD`, for use as a `compatibilityDate`.
 * Cloudflare recommends keeping this current.
 */
export function compatibilityDate(date: Date = new Date()): string {
	return date.toISOString().slice(0, 10);
}

/** Builds the default export of `cloudflare.config.ts` for a spacefn app. */
export function defineSpace(
	worker: SpaceWorkerConfig,
): CloudflareConfig & { worker: WorkerConfig } {
	return { worker: { entrypoint: DEFAULT_ENTRYPOINT, ...worker } };
}

export { bindings, exports, triggers } from "cf/config";
