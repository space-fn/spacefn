import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Effect } from "effect";

import type { AppConfig, Target } from "../app-config.ts";
import { SpaceError } from "../errors.ts";

interface PackageJson {
	readonly name?: unknown;
	readonly imports?: unknown;
}

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

/** The app's name and code folders from `package.json`, with the target from the Vite plugin. */
export const loadAppConfig = Effect.fnUntraced(function* (
	root: string,
	target: Target,
): Effect.fn.Return<AppConfig, SpaceError> {
	const pkg = yield* Effect.tryPromise(() => readFile(join(root, "package.json"), "utf8")).pipe(
		Effect.map((text) => JSON.parse(text) as PackageJson),
		Effect.orElseSucceed((): PackageJson => ({})),
	);
	const name = typeof pkg.name === "string" ? pkg.name.replace(/^@[^/]+\//, "") : undefined;
	if (!name || !/^[a-z][a-z0-9-]*$/.test(name))
		return yield* new SpaceError({
			code: "CONFIG_NAME",
			message: `App name "${name ?? ""}" is not usable for Workers and containers`,
			hint: 'Set name in package.json to lowercase letters, digits and -, e.g. "name": "my-app".',
			file: "package.json",
		});
	return { target, name, folders: importFolders(pkg.imports) };
});
