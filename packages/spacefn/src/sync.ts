import { access } from "node:fs/promises";
import { join } from "node:path";

import { analyzeQueries, buildQueries } from "./db/build-queries";
import { generateMigrationsSource } from "./db/generate";
import { generateTenantSource } from "./db/generate-tenant";
import { scanMigrations } from "./db/scan";
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
	const migrations = await scanMigrations(join(root, "db", "migrations"));
	const queriesSource = await buildQueries(join(root, "db", "queries"), migrations);
	const tenantDir = join(root, "tenant");
	const hasTenant = await access(tenantDir).then(
		() => true,
		() => false,
	);
	const tenantMigrations = hasTenant ? await scanMigrations(join(tenantDir, "migrations")) : [];
	const tenantSource = hasTenant
		? generateTenantSource(
				await analyzeQueries(join(tenantDir, "queries"), tenantMigrations),
				tenantMigrations,
			)
		: undefined;
	const results = await Promise.all([
		syncRoutes(root, mode),
		writeIfChanged(
			join(root, ".space", "worker.ts"),
			generateWorkerSource({ hasEnv, middleware, queues, crons, tenant: hasTenant }),
		),
		writeIfChanged(join(root, ".space", "env.d.ts"), generateEnvTypesSource(hasEnv)),
		writeIfChanged(join(root, ".space", "queues.ts"), generateQueuesSource(queues)),
		writeIfChanged(join(root, ".space", "migrations.ts"), generateMigrationsSource(migrations)),
		writeIfChanged(join(root, ".space", "queries.ts"), queriesSource),
		...(tenantSource === undefined
			? []
			: [writeIfChanged(join(root, ".space", "tenant.ts"), tenantSource)]),
	]);
	return results.some(Boolean);
}
