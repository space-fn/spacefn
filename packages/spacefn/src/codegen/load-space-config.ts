import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { Effect, Schema } from "effect";

import { SpaceError } from "../errors.ts";
import { SpaceConfig, type ResolvedSpaceConfig } from "../space-config.ts";

export const SPACE_CONFIG_FILE = "configs/space.ts";

// Node caches modules by URL. A counter (not a timestamp) makes every load a new URL,
// so two edits in the same millisecond are both seen.
let loads = 0;

const fail = (code: string, message: string, hint?: string) =>
	new SpaceError({ code, message, file: SPACE_CONFIG_FILE, ...(hint ? { hint } : {}) });

interface PackageJson {
	readonly name?: unknown;
	readonly imports?: unknown;
}

const readPackage = (root: string) =>
	Effect.tryPromise(() => readFile(join(root, "package.json"), "utf8")).pipe(
		Effect.map((text) => JSON.parse(text) as PackageJson),
		Effect.orElseSucceed((): PackageJson => ({})),
	);

/** `"#lib/*": "./lib/*"` gives `lib`. Generated `.space/` is not the app's own code. */
export const importFolders = (imports: unknown): string[] => {
	if (typeof imports !== "object" || imports === null) return [];
	const folders = new Set<string>();
	for (const target of Object.values(imports)) {
		const folder = typeof target === "string" ? /^\.\/([^*]+?)\/\*$/.exec(target)?.[1] : undefined;
		if (folder && folder !== ".space") folders.add(folder);
	}
	return [...folders];
};

/**
 * Loads `configs/space.ts` from the app root with Node's built-in TypeScript
 * support, validates it and applies defaults.
 */
export const loadSpaceConfig = Effect.fnUntraced(function* (
	root: string,
): Effect.fn.Return<ResolvedSpaceConfig, SpaceError> {
	const url = pathToFileURL(join(root, SPACE_CONFIG_FILE));
	url.searchParams.set("load", String(++loads));
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
	const pkg = yield* readPackage(root);
	const name =
		config.name ?? (typeof pkg.name === "string" ? pkg.name.replace(/^@[^/]+\//, "") : undefined);
	if (!name || !/^[a-z][a-z0-9-]*$/.test(name))
		return yield* fail(
			"CONFIG_NAME",
			`App name "${name ?? ""}" is not usable for Workers and containers`,
			'Set name in configs/space.ts, e.g. name: "my-app".',
		);

	return {
		target: config.target,
		name,
		folders: importFolders(pkg.imports),
	};
});
