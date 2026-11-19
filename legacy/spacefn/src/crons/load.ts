import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { SpaceError } from "../errors";
import { scanCodeFiles } from "../scan";
import type { CronJob } from "./define";

/**
 * Imports each `crons/` file to read its schedule. Cron files must not have side
 * effects at import time, because this runs while the build config loads.
 */
export async function loadCronJobs(root: string): Promise<Record<string, CronJob>> {
	const files = await scanCodeFiles(join(root, "app", "crons"));
	const jobs: Record<string, CronJob> = {};
	for (const file of files) {
		const url = `${pathToFileURL(join(root, "app", "crons", file)).href}?v=${crypto.randomUUID()}`;
		const mod = (await import(/* @vite-ignore */ url)) as { default?: CronJob };
		if (!mod.default || typeof mod.default.run !== "function") {
			throw new SpaceError(
				"CRON_INVALID",
				`crons/${file} must default-export the result of defineCron()`,
				{ file, hint: "Use `export default defineCron({ ... })`." },
			);
		}
		jobs[file.replace(/\.(?:[cm]?[jt]s|[jt]sx)$/, "")] = mod.default;
	}
	return jobs;
}
