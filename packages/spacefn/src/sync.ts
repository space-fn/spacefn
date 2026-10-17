import { access } from "node:fs/promises";
import { join } from "node:path";

import { analyzeQueries, buildQueries } from "./db/build-queries";
import { generateMigrationsSource } from "./db/generate";
import { generateTenantSource } from "./db/generate-tenant";
import { scanMigrations } from "./db/scan";
import { generateWorkerSource } from "./entry";
import { generateEnvTypesSource } from "./env/types";
import { scanMiddleware } from "./middleware/scan";
import { generatePagesSource } from "./pages/generate";
import { scanPages } from "./pages/scan";
import { generateQueuesSource } from "./queues/generate";
import type { Mode } from "./routes/scan";
import { scanRoutes } from "./routes/scan";
import { syncRoutes } from "./routes/sync";
import { scanCodeFiles } from "./scan";
import { writeIfChanged } from "./write";

/** Convention folders live under `<root>/app` (see the folder conventions doc). */
function appDir(root: string): string {
	return join(root, "app");
}

/** Regenerates everything under `<root>/.space`. Returns whether any file changed. */
export async function sync(root: string, mode: Mode): Promise<boolean> {
	const app = appDir(root);
	const hasEnv = await access(join(app, "env.ts")).then(
		() => true,
		() => false,
	);
	const middleware = await scanMiddleware(join(app, "middleware"));
	const queues = await scanCodeFiles(join(app, "queues"));
	const crons = await scanCodeFiles(join(app, "crons"));
	const migrations = await scanMigrations(join(app, "db", "migrations"));
	const queriesSource = await buildQueries(join(app, "db", "queries"), migrations);
	const pages = await scanPages(join(app, "pages"));
	if (pages.length > 0) {
		const routePaths = new Set(
			(await scanRoutes(join(app, "routes"), mode)).map((route) => route.path),
		);
		for (const page of pages) {
			if (routePaths.has(page.path)) {
				throw new Error(
					`pages/${page.file} and a route both serve ${page.path}. Give one of them another path.`,
				);
			}
		}
	}

	const tenantDir = join(app, "tenant");
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
			generateWorkerSource({
				hasEnv,
				middleware,
				queues,
				crons,
				tenant: hasTenant,
				pages: pages.length > 0,
			}),
		),
		writeIfChanged(join(root, ".space", "env.d.ts"), generateEnvTypesSource(hasEnv)),
		writeIfChanged(join(root, ".space", "queues.ts"), generateQueuesSource(queues)),
		writeIfChanged(join(root, ".space", "migrations.ts"), generateMigrationsSource(migrations)),
		writeIfChanged(join(root, ".space", "queries.ts"), queriesSource),
		writeIfChanged(join(root, ".space", "pages.ts"), generatePagesSource(pages)),
		...(tenantSource === undefined
			? []
			: [writeIfChanged(join(root, ".space", "tenant.ts"), tenantSource)]),
	]);
	return results.some(Boolean);
}
