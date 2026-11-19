import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { Effect, Schema } from "effect";

import { SpaceError } from "../errors.ts";
import { DEFAULT_ALIASES, SpaceConfig, type ResolvedSpaceConfig } from "../space-config.ts";

export const SPACE_CONFIG_FILE = "configs/space.ts";

const fail = (code: string, message: string, hint?: string) =>
	new SpaceError({ code, message, file: SPACE_CONFIG_FILE, ...(hint ? { hint } : {}) });

const packageName = (root: string) =>
	Effect.tryPromise(() => readFile(join(root, "package.json"), "utf8")).pipe(
		Effect.map((text) => (JSON.parse(text) as { name?: unknown }).name),
		Effect.map((name) => (typeof name === "string" ? name.replace(/^@[^/]+\//, "") : undefined)),
		Effect.orElseSucceed(() => undefined),
	);

/**
 * Loads `configs/space.ts` from the app root with Node's built-in TypeScript
 * support, validates it and applies defaults.
 */
export const loadSpaceConfig = (root: string): Effect.Effect<ResolvedSpaceConfig, SpaceError> =>
	Effect.gen(function* () {
		const url = pathToFileURL(join(root, SPACE_CONFIG_FILE));
		url.searchParams.set("t", String(Date.now())); // re-read after edits in watch mode
		const module = yield* Effect.tryPromise({
			try: () => import(url.href) as Promise<{ default?: unknown }>,
			catch: (cause) => {
				const missing =
					(cause as { code?: string }).code === "ERR_MODULE_NOT_FOUND" &&
					String((cause as Error).message).includes(SPACE_CONFIG_FILE);
				return missing
					? fail(
							"CONFIG_MISSING",
							"No configs/space.ts found",
							'Create it with: export default defineSpace({ target: "cloudflare" })',
						)
					: fail("CONFIG_LOAD", `Could not load: ${(cause as Error).message}`);
			},
		});
		if (module.default === undefined)
			return yield* fail(
				"CONFIG_EXPORT",
				"configs/space.ts has no default export",
				"Export the config: export default defineSpace({ ... })",
			);

		const config = yield* Schema.decodeUnknownEffect(SpaceConfig)(module.default).pipe(
			Effect.mapError((error) => fail("CONFIG_INVALID", error.message)),
		);
		const name = config.name ?? (yield* packageName(root));
		if (!name || !/^[a-z][a-z0-9-]*$/.test(name))
			return yield* fail(
				"CONFIG_NAME",
				`App name "${name ?? ""}" is not usable for Workers and containers`,
				'Set name in configs/space.ts, e.g. name: "my-app".',
			);

		return { target: config.target, name, aliases: { ...DEFAULT_ALIASES, ...config.aliases } };
	});
