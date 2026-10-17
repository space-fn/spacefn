import { access } from "node:fs/promises";
import { join } from "node:path";

import { generateWorkerSource } from "./entry";
import type { Mode } from "./routes/scan";
import { syncRoutes } from "./routes/sync";
import { writeIfChanged } from "./write";

/** Regenerates everything under `<root>/.space`. Returns whether any file changed. */
export async function sync(root: string, mode: Mode): Promise<boolean> {
	const hasEnv = await access(join(root, "env.ts")).then(
		() => true,
		() => false,
	);
	const results = await Promise.all([
		syncRoutes(root, mode),
		writeIfChanged(join(root, ".space", "worker.ts"), generateWorkerSource({ hasEnv })),
	]);
	return results.some(Boolean);
}
