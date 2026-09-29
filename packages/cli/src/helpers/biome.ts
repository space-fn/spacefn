import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Biome config for a project: its own `biome.jsonc` / `biome.json` if present,
 * else the default config bundled with this package.
 */
export function resolveBiomeConfig(root: string): string {
	for (const file of ["biome.jsonc", "biome.json"]) {
		const path = resolve(root, file);
		if (existsSync(path)) return path;
	}
	return new URL("../../biome.json", import.meta.url).pathname;
}
