import { access, readdir } from "node:fs/promises";
import { join } from "node:path";

import { generateBindingsSource } from "./bindings/generate";
import { generateClientManifestSource, generateClientSource } from "./client/generate";
import { scanClientFiles } from "./client/scan";
import { analyzeQueries } from "./db/build-queries";
import { generateDbSource } from "./db/generate-db";
import { scanMigrations } from "./db/scan";
import { generateExportsSource, generateWorkerSource } from "./entry";
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

/** Convention folders live under `<root>/app`. */
function appDir(root: string): string {
	return join(root, "app");
}

/** Reads the names of database folders under `<root>/app/db`. */
async function scanDatabases(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		},
	);
	return entries
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
		.map((entry) => entry.name)
		.sort();
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
	const durableObjects = await scanCodeFiles(join(app, "durable-objects"));
	const workflows = await scanCodeFiles(join(app, "workflows"));
	const clientFiles = await scanClientFiles(join(app, "client"));

	// Read env schema. A broken env.ts must fail loudly: empty bindings would
	// hide the error until a request hits the app.
	let envFields: Array<{ name: string }> = [];
	if (hasEnv) {
		try {
			const mod = await import(join(app, "env.ts"));
			const schema = mod.default ?? mod;
			envFields = Object.keys(schema ?? {}).map((name) => ({ name }));
		} catch (error) {
			throw new Error(
				`app/env.ts failed to load: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	// Read cloudflare config. A missing config is fine; a broken one is not.
	let cloudflareBindings: Record<string, { type?: string }> = {};
	const hasCloudflareConfig = await access(join(root, "cloudflare.config.ts")).then(
		() => true,
		() => false,
	);
	if (hasCloudflareConfig) {
		try {
			const cfg = await import(join(root, "cloudflare.config.ts"));
			const config = cfg.default ?? cfg;
			const env = config?.worker?.env ?? config?.env ?? {};
			cloudflareBindings = env;
		} catch (error) {
			throw new Error(
				`cloudflare.config.ts failed to load: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
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

	const databases = await scanDatabases(join(app, "db"));
	const results: (boolean | undefined)[] = [
		await syncRoutes(root, mode),
		await writeIfChanged(
			join(root, ".space", "worker.ts"),
			generateWorkerSource({
				middleware,
				queues,
				crons,
				pages: pages.length > 0,
			}),
		),
		await writeIfChanged(
			join(root, ".space", "exports.ts"),
			generateExportsSource({
				durableObjects,
				workflows,
			}),
		),
		await writeIfChanged(join(root, ".space", "env.d.ts"), generateEnvTypesSource(hasEnv)),
		await writeIfChanged(
			join(root, ".space", "bindings.d.ts"),
			generateBindingsSource({
				envFields,
				cloudflareBindings,
				durableObjectFiles: durableObjects,
				workflowFiles: workflows,
				queueFiles: queues,
			}),
		),
		await writeIfChanged(join(root, ".space", "queues.ts"), generateQueuesSource(queues)),
		await writeIfChanged(join(root, ".space", "pages.ts"), generatePagesSource(pages)),
		await writeIfChanged(join(root, ".space", "client.ts"), generateClientSource(clientFiles)),
		await writeIfChanged(
			join(root, ".space", "client-manifest.ts"),
			generateClientManifestSource(clientFiles),
		),
	];

	for (const name of databases) {
		const dir = join(app, "db", name);
		const migrations = await scanMigrations(join(dir, "migrations"));
		let dialect: "sqlite" | "postgres" = "sqlite";
		const configPath = join(dir, "config.ts");
		const hasConfig = await access(configPath).then(
			() => true,
			() => false,
		);
		if (hasConfig) {
			try {
				const cfg = await import(configPath);
				dialect = (cfg.default ?? cfg).dialect ?? "sqlite";
			} catch (error) {
				throw new Error(
					`app/db/${name}/config.ts failed to load: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
		const queries = await analyzeQueries(join(dir, "queries"), migrations, dialect);
		results.push(
			await writeIfChanged(
				join(root, ".space", "db", `${name}.ts`),
				generateDbSource(name, migrations, queries),
			),
		);
	}

	return results.some(Boolean);
}
