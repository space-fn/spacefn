import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Vite/Vitest config for a project: `configs/<tool>.config.*` (the scaffold
 * convention) or the tool's own root-level default, whichever exists first.
 */
export function resolveConfig(root: string, tool: "vite" | "vitest"): string | undefined {
	for (const dir of ["configs", "."]) {
		for (const ext of ["ts", "mts", "js", "mjs"]) {
			const path = resolve(root, dir, `${tool}.config.${ext}`);
			if (existsSync(path)) return path;
		}
	}
	return undefined;
}
