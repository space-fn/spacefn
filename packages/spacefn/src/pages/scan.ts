import { readdir } from "node:fs/promises";

import { parseRoutePath } from "../routes/path";

export interface PageFile {
	/** Path relative to `pages/`, e.g. `users/[id].page.ts`. */
	file: string;
	/** The matching `.server.ts` relative path, when the page has one. */
	server?: string;
	/** Hono path, e.g. `/users/:id`. */
	path: string;
}

const PAGE = /\.page\.(?:[cm]?[jt]s|[jt]sx)$/;

/**
 * Finds `*.page.ts` files under `dir`, pairs each with its `*.server.ts` when there
 * is one, and gives each its URL path. Files starting with `_` are ignored.
 */
export async function scanPages(dir: string): Promise<PageFile[]> {
	const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		},
	);
	const files = new Set<string>();
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const file = `${entry.parentPath}/${entry.name}`.slice(dir.length + 1).replaceAll("\\", "/");
		if (file.split("/").some((segment) => segment.startsWith("_"))) continue;
		files.add(file);
	}

	const pages: PageFile[] = [];
	for (const file of [...files].sort()) {
		if (!PAGE.test(file)) continue;
		const base = file.replace(PAGE, "");
		const route = parseRoutePath(`${base}.ts`);
		if (!route) continue;
		if (route.env) throw new Error(`pages/${file}: pages do not support environment suffixes`);
		const serverFile = [...files].find(
			(candidate) =>
				/\.server\.(?:[cm]?[jt]s|[jt]sx)$/.test(candidate) &&
				candidate.replace(/\.server\.(?:[cm]?[jt]s|[jt]sx)$/, "") === base,
		);
		pages.push({ file, server: serverFile, path: route.path });
	}
	return pages;
}
