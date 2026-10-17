import { readdir } from "node:fs/promises";

import { parseRoutePath, type RouteEnv } from "./path";

export type Mode = RouteEnv;

export interface RouteFile {
	/** File path relative to the routes directory, with `/` separators. */
	file: string;
	/** Hono path pattern. */
	path: string;
}

function rank(segment: string): number {
	if (segment.includes("{")) return 2;
	if (segment.startsWith(":")) return 1;
	return 0;
}

function compare(a: RouteFile, b: RouteFile): number {
	const left = a.path.split("/");
	const right = b.path.split("/");
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const l = left[i];
		const r = right[i];
		if (l === r) continue;
		if (l === undefined) return -1;
		if (r === undefined) return 1;
		return rank(l) - rank(r) || l.localeCompare(r);
	}
	return 0;
}

/** Lists route files under `dir`, ordered so the most specific path wins. */
export async function scanRoutes(dir: string, mode: Mode): Promise<RouteFile[]> {
	const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		},
	);

	const routes = new Map<string, RouteFile>();
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const file = `${entry.parentPath}/${entry.name}`.slice(dir.length + 1).replaceAll("\\", "/");
		const parsed = parseRoutePath(file);
		if (!parsed || (parsed.env && parsed.env !== mode)) continue;

		const existing = routes.get(parsed.path);
		if (existing) {
			throw new Error(`Routes "${existing.file}" and "${file}" both map to ${parsed.path}`);
		}
		routes.set(parsed.path, { file, path: parsed.path });
	}
	return [...routes.values()].sort(compare);
}
