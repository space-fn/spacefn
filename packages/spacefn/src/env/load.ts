import { access } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { Schema } from "./fields";

/** Loads the default export of `<root>/env.ts`, or `undefined` when there is none. */
export async function loadEnvSchema(root: string): Promise<Schema | undefined> {
	const file = join(root, "app", "env.ts");
	const exists = await access(file).then(
		() => true,
		() => false,
	);
	if (!exists) return undefined;

	const url = `${pathToFileURL(file).href}?v=${crypto.randomUUID()}`;
	const mod = (await import(/* @vite-ignore */ url)) as { default?: Schema };
	if (!mod.default || typeof mod.default !== "object") {
		throw new Error(`${file} must export the result of defineEnv() as its default export`);
	}
	return mod.default;
}
