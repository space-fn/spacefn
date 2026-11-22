import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import { Effect } from "effect";

import { SpaceError } from "../errors.ts";
import { GENERATED } from "./render-manifest.ts";

export interface WriteResult {
	/** Paths inside `.space/` whose content changed. */
	readonly written: readonly string[];
	/** Generated files that are no longer produced and were deleted. */
	readonly removed: readonly string[];
}

/** Folders in `.space/` that belong to other tools (Alchemy state, build output). */
const FOREIGN = new Set([".alchemy", "dist", "node_modules"]);

const io = (file: string) => (cause: unknown) =>
	new SpaceError({ code: "GEN_WRITE", message: `Could not write: ${String(cause)}`, file });

const generatedFiles = async (dir: string): Promise<string[]> => {
	const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		},
	);
	const found: string[] = [];
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
		const file = relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/");
		if (FOREIGN.has(file.split("/")[0] ?? "")) continue;
		const head = await readFile(join(dir, file), "utf8");
		if (head.startsWith(GENERATED)) found.push(file);
	}
	return found;
};

/**
 * Writes `files` into `<root>/.space`, touching only files whose content
 * changed so watchers (Vite, Alchemy) only react to real changes. Generated
 * files that are no longer produced are deleted; anything else is left alone.
 */
export const writeGenerated = (
	root: string,
	files: Readonly<Record<string, string>>,
): Effect.Effect<WriteResult, SpaceError> =>
	Effect.tryPromise({
		try: async () => {
			const dir = join(root, ".space");
			const written: string[] = [];
			for (const [file, content] of Object.entries(files)) {
				const target = join(dir, file);
				const current = await readFile(target, "utf8").catch(() => undefined);
				if (current === content) continue;
				await mkdir(dirname(target), { recursive: true });
				await writeFile(target, content);
				written.push(file);
			}
			const removed = (await generatedFiles(dir)).filter((file) => !(file in files));
			for (const file of removed) await rm(join(dir, file));
			return { written: written.sort(), removed: removed.sort() };
		},
		catch: io(".space"),
	});
