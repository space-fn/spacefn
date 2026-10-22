import { join, resolve, sep } from "node:path";

import { cloudflare, type PluginConfig } from "@cloudflare/vite-plugin";
import type { Plugin, PluginOption } from "vite";

import { runClientBuild } from "./client/build";
import { generateClientManifestSource } from "./client/generate";
import { envBindings } from "./cloudflare";
import { cronConfig } from "./crons/config";
import { loadCronJobs } from "./crons/load";
import { createDocsReader } from "./docs/reader";
import { durableObjectsConfig } from "./durable-objects/config";
import type { Schema } from "./env/fields";
import { loadEnvSchema } from "./env/load";
import { queueConfig } from "./queues/config";
import type { Mode } from "./routes/scan";
import { scanCodeFiles } from "./scan";
import { sync } from "./sync";
import { workflowsConfig } from "./workflows/config";
import { writeIfChanged } from "./write";

/** The partial Worker config the plugin's `config` callback may return. */
type WorkerConfigPatch = ReturnType<Extract<NonNullable<PluginConfig["config"]>, Function>>;

export interface SpaceState {
	/** The schema from `env.ts`, loaded when Vite resolves its config. */
	envSchema?: Schema;
	/** Files in `queues/`, loaded when Vite resolves its config. */
	queueFiles?: string[];
	/** Schedules declared by `crons/`, read when Vite resolves its config. */
	cronSchedules?: string[];
	/** Files in `durable-objects/`. */
	durableObjectFiles?: string[];
	/** Files in `workflows/`. */
	workflowFiles?: string[];
}

/** Keeps `.space/` in step with the project's convention folders. */
export function spaceSync(state: SpaceState = {}): Plugin {
	let root = process.cwd();
	let mode: Mode = "dev";
	let clientFiles: string[] = [];

	return {
		name: "space",

		async config(userConfig, env) {
			root = resolve(userConfig.root ?? process.cwd());
			mode = env.command === "serve" ? "dev" : "prod";
			state.envSchema = await loadEnvSchema(root);
			state.queueFiles = await scanCodeFiles(join(root, "queues"));
			state.cronSchedules = Object.values(await loadCronJobs(root)).map((job) => job.schedule);
			state.durableObjectFiles = await scanCodeFiles(join(root, "app", "durable-objects"));
			state.workflowFiles = await scanCodeFiles(join(root, "app", "workflows"));
			clientFiles = await (
				await import("./client/scan")
			).scanClientFiles(join(root, "app", "client"));
			await sync(root, mode);
			return {
				environments: {
					client: { build: { emptyOutDir: false } },
				},
			};
		},

		configureServer(server) {
			// Dev-only: render the project's docs/ folder as HTML at /__space_docs.
			server.middlewares.use("/__space_docs", createDocsReader(root));

			// Routes: sync on add/change/unlink.
			const routesDir = resolve(root, "app", "routes");
			server.watcher.add(routesDir);
			const onRouteChange = (file: string) => {
				if (!file.startsWith(routesDir + sep)) return;
				sync(root, mode).catch((error: unknown) => server.config.logger.error(String(error)));
			};
			server.watcher.on("add", onRouteChange);
			server.watcher.on("change", onRouteChange);
			server.watcher.on("unlink", onRouteChange);
			server.watcher.on("addDir", onRouteChange);
			server.watcher.on("unlinkDir", onRouteChange);

			// Pages: sync (route table changes).
			const pagesDir = resolve(root, "app", "pages");
			server.watcher.add(pagesDir);
			const onPageChange = (file: string) => {
				if (!file.startsWith(pagesDir + sep)) return;
				sync(root, mode).catch((error: unknown) => server.config.logger.error(String(error)));
			};
			server.watcher.on("add", onPageChange);
			server.watcher.on("change", onPageChange);
			server.watcher.on("unlink", onPageChange);
			server.watcher.on("addDir", onPageChange);
			server.watcher.on("unlinkDir", onPageChange);

			// Client: serve /_client/* in dev through Vite's transform pipeline.
			server.middlewares.use("/_client", (req, res, next) => {
				const url = (req.url ?? "").split("?")[0] ?? "";
				const query = (req.url ?? "").includes("?direct") ? "?direct" : "";
				const target = "/app/client" + url + query;
				server.environments.client
					.transformRequest(target)
					.then((result) => {
						if (!result) return next();
						res.setHeader(
							"Content-Type",
							url.endsWith(".css") ? "text/css" : "application/javascript",
						);
						res.end(result.code);
					})
					.catch(() => next());
			});

			// Client: codegen regenerates .space/client*.ts (typed entry names).
			const clientDir = resolve(root, "app", "client");
			server.watcher.add(clientDir);
			const onClientChange = (file: string) => {
				if (!file.startsWith(clientDir + sep)) return;
				sync(root, mode).catch((error: unknown) => server.config.logger.error(String(error)));
			};
			const onClientRestart = (file: string) => {
				if (!file.startsWith(clientDir + sep)) return;
				server.restart().catch((error: unknown) => server.config.logger.error(String(error)));
			};
			server.watcher.on("add", onClientChange);
			server.watcher.on("change", onClientChange);
			server.watcher.on("unlink", onClientChange);
			server.watcher.on("addDir", onClientChange);
			server.watcher.on("unlinkDir", onClientChange);
			server.watcher.on("add", onClientRestart);
			server.watcher.on("unlink", onClientRestart);

			// DB: sql files regenerate typed queries; migrate.ts/queries changes too.
			const dbDir = resolve(root, "app", "db");
			const onDbChange = (file: string) => {
				if (!file.startsWith(dbDir + sep)) return;
				sync(root, mode).catch((error: unknown) => server.config.logger.error(String(error)));
			};
			server.watcher.add(dbDir);
			server.watcher.on("add", onDbChange);
			server.watcher.on("change", onDbChange);
			server.watcher.on("unlink", onDbChange);
			server.watcher.on("addDir", onDbChange);
			server.watcher.on("unlinkDir", onDbChange);

			// Bindings come from env.ts when Vite resolves its config, so a change needs a restart.
			const envFile = resolve(root, "app", "env.ts");
			const onEnvChange = (file: string) => {
				if (file !== envFile) return;
				server.restart().catch((error: unknown) => server.config.logger.error(String(error)));
			};
			server.watcher.on("add", onEnvChange);
			server.watcher.on("change", onEnvChange);
			server.watcher.on("unlink", onEnvChange);

			// Queue/cron/DO/workflow files change the Worker config: restart.
			const configDirs = [
				resolve(root, "app", "queues"),
				resolve(root, "app", "crons"),
				resolve(root, "app", "durable-objects"),
				resolve(root, "app", "workflows"),
				resolve(root, "app", "middleware"),
			];
			const onConfigFileChange = (file: string) => {
				if (!configDirs.some((dir) => file.startsWith(dir + sep))) return;
				server.restart().catch((error: unknown) => server.config.logger.error(String(error)));
			};
			for (const dir of configDirs) server.watcher.add(dir);
			server.watcher.on("add", onConfigFileChange);
			server.watcher.on("change", onConfigFileChange);
			server.watcher.on("unlink", onConfigFileChange);
			server.watcher.on("addDir", onConfigFileChange);
			server.watcher.on("unlinkDir", onConfigFileChange);
		},
		buildApp: {
			order: "pre",
			async handler(builder: any) {
				if (clientFiles.length === 0) return;
				const manifest = await runClientBuild(root, clientFiles, builder);
				await writeIfChanged(
					join(root, ".space", "client-manifest.ts"),
					generateClientManifestSource(clientFiles, manifest),
				);
			},
		},
	};
}

export interface SpaceOptions {
	/** Passed through to the Cloudflare Vite plugin. */
	cloudflare?: Omit<PluginConfig, "config">;
}

/** The one Vite plugin a spacefn app needs: folder sync plus the Cloudflare runtime. */
export function space(options: SpaceOptions = {}): PluginOption[] {
	const state: SpaceState = {};
	return [
		spaceSync(state),
		cloudflare({
			...options.cloudflare,
			// `env.ts` cannot be imported by `cloudflare.config.ts`: the plugin makes
			// every file the config imports unreadable to the Worker.
			// The plugin's `config` type names its parsed (output) binding forms, while
			// the helpers below build the input forms the plugin also accepts at run
			// time. One cast at this beta boundary, typed to the expected patch.
			config: (worker) => {
				const queues = queueConfig(state.queueFiles ?? []);
				const crons = cronConfig(state.cronSchedules ?? []);
				const scheduled = [...queues.triggers, ...crons.triggers];
				const dos = durableObjectsConfig(state.durableObjectFiles ?? [], worker.name);
				const wfs = workflowsConfig(state.workflowFiles ?? [], worker.name);
				return {
					env: {
						...(state.envSchema && envBindings(state.envSchema)),
						...queues.env,
						...dos.env,
						...wfs.env,
						...worker.env,
					},
					exports: { ...worker.exports, ...dos.exports, ...wfs.exports },
					...(scheduled.length > 0 ? { triggers: scheduled } : {}),
				} as WorkerConfigPatch;
			},
		}),
	];
}
