import { readdir } from "node:fs/promises";

const CODE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

/**
 * Lists the middleware files in `dir`, sorted by name so numeric prefixes set
 * the order (`01-auth.ts` runs before `02-log.ts`). Files starting with `_` are
 * ignored. Returns `[]` when the folder does not exist.
 */
export async function scanMiddleware(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		},
	);
	return entries
		.filter((entry) => entry.isFile() && CODE_FILE.test(entry.name) && !entry.name.startsWith("_"))
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}
