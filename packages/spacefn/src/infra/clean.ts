import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/** What `space clean` leaves in `.space/`: Alchemy's deploy state and local dev data, and the local databases. */
export const KEPT = [".alchemy", "data"] as const;

/**
 * `space clean`: deletes what `space gen` made in `.space/` and what
 * `space build` made in `dist/`, giving their paths from the app root. Never
 * the deploy state, which tracks what is deployed, or local data.
 */
export const clean = async (root: string): Promise<readonly string[]> => {
	const dir = join(root, ".space");
	const entries = await readdir(dir).catch(() => [] as string[]);
	const removed = entries
		.filter((entry) => !(KEPT as readonly string[]).includes(entry))
		.sort()
		.map((entry) => `.space/${entry}`);
	const built = await readdir(join(root, "dist")).then(
		() => true,
		() => false,
	);
	if (built) removed.push("dist");
	for (const entry of removed) await rm(join(root, entry), { recursive: true, force: true });
	return removed;
};
