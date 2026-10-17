import { readdir } from "node:fs/promises";

const CODE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

/**
 * Lists the code files directly inside `dir`, by file name. Files starting with
 * `_` are ignored. Returns `[]` when the folder does not exist.
 */
export async function scanCodeFiles(dir: string): Promise<string[]> {
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

/** `emails.ts` becomes `emails`. */
export function baseName(file: string): string {
	return file.replace(CODE_FILE, "");
}
