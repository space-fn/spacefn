import { readdir } from "node:fs/promises";

const CODE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const CSS_FILE = /\.css$/;

/**
 * Lists the client entries directly inside `dir`, by file name. Code files and
 * CSS files are both entries. Files starting with `_` are ignored. Returns `[]`
 * when the folder does not exist.
 */
export async function scanClientFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		},
	);
	return entries
		.filter(
			(entry) =>
				entry.isFile() &&
				(CODE_FILE.test(entry.name) || CSS_FILE.test(entry.name)) &&
				!entry.name.startsWith("_") &&
				!entry.name.includes(".test.") &&
				!entry.name.includes(".spec."),
		)
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

/** `counter.ts` / `site.css` keep their extension (entry names are file names). */
export function isCssEntry(file: string): boolean {
	return CSS_FILE.test(file);
}
