import { access } from "node:fs/promises";
import { join } from "node:path";

import { generateWorkerSource } from "./entry";
import { generateEnvTypesSource } from "./env/types";
import { scanMiddleware } from "./middleware/scan";
import { generateQueuesSource } from "./queues/generate";
import type { Mode } from "./routes/scan";
import { syncRoutes } from "./routes/sync";
import { scanCodeFiles } from "./scan";
import { writeIfChanged } from "./write";

/** Regenerates everything under `<root>/.space`. Returns whether any file changed. */
export async function sync(root: string, mode: Mode): Promise<boolean> {
	const hasEnv = await access(join(root, "env.ts")).then(
		() => true,
		() => false,
	);
	const middleware = await scanMiddleware(join(root, "middleware"));
	const queues = await scanCodeFiles(join(root, "queues"));
	const crons = await scanCodeFiles(join(root, "crons"));
	const results = await Promise.all([
		syncRoutes(root, mode),
		writeIfChanged(
			join(root, ".space", "worker.ts"),
			generateWorkerSource({ hasEnv, middleware, queues, crons }),
		),
		writeIfChanged(join(root, ".space", "env.d.ts"), generateEnvTypesSource(hasEnv)),
		writeIfChanged(join(root, ".space", "queues.ts"), generateQueuesSource(queues)),
	]);
	return results.some(Boolean);
}
