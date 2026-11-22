// The app's Vite config, `configs/vite.ts`, is where its target is set: `space({ target })`.
import { existsSync } from "node:fs";
import { join } from "node:path";

import { Effect } from "effect";
import { SpaceError, type Target } from "spacefn";

export const VITE_CONFIG_FILE = "configs/vite.ts";

/** What the spacefn plugin exposes on its `api`, for the CLI to read without running Vite. */
export interface SpacePluginApi {
	readonly spacefn: { readonly target: Target };
}

const flatten = async (plugins: unknown): Promise<unknown[]> => {
	const value = await plugins;
	if (Array.isArray(value)) return (await Promise.all(value.map(flatten))).flat();
	return value ? [value] : [];
};

const configError = (code: string, message: string, hint?: string) =>
	new SpaceError({ code, message, file: VITE_CONFIG_FILE, ...(hint ? { hint } : {}) });

const HINT =
	'Add the plugin: import { space } from "spacefn/vite"; export default defineConfig({ plugins: [space({ target: "cloudflare" })] })';

/**
 * The target of the spacefn plugin in `configs/vite.ts`, loaded the way Vite
 * loads it (so it may be a function, or import other plugins).
 */
export const loadTarget = (root: string): Effect.Effect<Target, SpaceError> =>
	Effect.gen(function* () {
		const file = join(root, VITE_CONFIG_FILE);
		if (!existsSync(file))
			return yield* configError("CONFIG_MISSING", `No ${VITE_CONFIG_FILE} found`, HINT);
		const plugins = yield* Effect.tryPromise({
			try: async () => {
				const { loadConfigFromFile } = await import("vite");
				const loaded = await loadConfigFromFile(
					{ command: "serve", mode: "development" },
					file,
					root,
					"silent",
				);
				return flatten(loaded?.config.plugins);
			},
			catch: (cause) =>
				configError(
					"CONFIG_LOAD",
					`Could not load: ${cause instanceof Error ? cause.message : String(cause)}`,
				),
		});
		const api = plugins
			.map((plugin) => (plugin as { api?: Partial<SpacePluginApi> }).api?.spacefn)
			.find((found) => found !== undefined);
		if (!api)
			return yield* configError("CONFIG_PLUGIN", "The spacefn plugin isn't in plugins", HINT);
		if (api.target !== "cloudflare" && api.target !== "bun")
			return yield* configError(
				"CONFIG_TARGET",
				`target is "${String(api.target)}"`,
				'Use "cloudflare" or "bun".',
			);
		return api.target;
	});
