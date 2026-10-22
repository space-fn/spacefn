import { readdir } from "node:fs/promises";

const CODE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const CSS_FILE = /\.css$/;
const SAFE_NAME = /^[\w.-]+$/;

/**
 * Lists the client entries directly inside `dir`, by file name. Code files and
 * CSS files are both entries. Files starting with `_` are ignored. Returns `[]`
 * when the folder does not exist.
 *
 * Only top-level files are entries (nested folders are not scanned). Two entries
 * sharing a base name (e.g. `counter.ts` and `counter.css`) are an error,
 * because they would collide in the output bundle.
 */
export async function scanClientFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		},
	);
	const files = entries
		.filter(
			(entry) =>
				entry.isFile() &&
				(CODE_FILE.test(entry.name) || CSS_FILE.test(entry.name)) &&
				!entry.name.endsWith(".d.ts") &&
				!entry.name.startsWith("_") &&
				!entry.name.includes(".test.") &&
				!entry.name.includes(".spec.") &&
				SAFE_NAME.test(entry.name),
		)
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

	const seen = new Map<string, string>();
	for (const file of files) {
		const base = file.replace(/\.[^.]+$/, "");
		const prev = seen.get(base);
		if (prev) {
			throw new Error(
				`app/client: entries "${prev}" and "${file}" share the base name "${base}". Rename one of them.`,
			);
		}
		seen.set(base, file);
	}
	return files;
}
