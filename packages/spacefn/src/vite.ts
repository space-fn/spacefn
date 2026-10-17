import { join, resolve, sep } from "node:path";

import { cloudflare, type PluginConfig } from "@cloudflare/vite-plugin";
import type { Plugin, PluginOption } from "vite";

import { envBindings } from "./cloudflare";
import { cronConfig } from "./crons/config";
import { loadCronJobs } from "./crons/load";
import type { Schema } from "./env/fields";
import { loadEnvSchema } from "./env/load";
import { queueConfig } from "./queues/config";
import type { Mode } from "./routes/scan";
import { scanCodeFiles } from "./scan";
import { sync } from "./sync";

export interface SpaceState {
	/** The schema from `env.ts`, loaded when Vite resolves its config. */
	envSchema?: Schema;
	/** Files in `queues/`, loaded when Vite resolves its config. */
	queueFiles?: string[];
	/** Schedules declared by `crons/`, read when Vite resolves its config. */
	cronSchedules?: string[];
}

/** Keeps `.space/` in step with the project's convention folders. */
export function spaceSync(state: SpaceState = {}): Plugin {
	let root = process.cwd();
	let mode: Mode = "dev";

	return {
		name: "space",

		async config(userConfig, env) {
			root = resolve(userConfig.root ?? process.cwd());
			mode = env.command === "serve" ? "dev" : "prod";
			state.envSchema = await loadEnvSchema(root);
			state.queueFiles = await scanCodeFiles(join(root, "queues"));
			state.cronSchedules = Object.values(await loadCronJobs(root)).map((job) => job.schedule);
			await sync(root, mode);
		},

		configureServer(server) {
			const routesDir = resolve(root, "app", "routes");
			server.watcher.add(routesDir);

			const onChange = (file: string) => {
				if (!file.startsWith(routesDir + sep)) return;
				sync(root, mode).catch((error: unknown) => server.config.logger.error(String(error)));
			};
			server.watcher.on("add", onChange);
			server.watcher.on("unlink", onChange);

			// Bindings come from env.ts when Vite resolves its config, so a change needs a restart.
			const envFile = resolve(root, "app", "env.ts");
			const onEnvChange = (file: string) => {
				if (file !== envFile) return;
				server.restart().catch((error: unknown) => server.config.logger.error(String(error)));
			};
			server.watcher.on("add", onEnvChange);
			server.watcher.on("change", onEnvChange);
			server.watcher.on("unlink", onEnvChange);

			// SQL changes only regenerate the typed queries; no restart needed.
			const dbDir = resolve(root, "app", "db");
			const onSqlChange = (file: string) => {
				if (!file.startsWith(dbDir + sep) || !file.endsWith(".sql")) return;
				sync(root, mode).catch((error: unknown) => server.config.logger.error(String(error)));
			};
			server.watcher.add(dbDir);
			server.watcher.on("add", onSqlChange);
			server.watcher.on("change", onSqlChange);
			server.watcher.on("unlink", onSqlChange);

			// Queue and cron files change the Worker config: a binding, a consumer or a schedule.
			const configDirs = [resolve(root, "app", "queues"), resolve(root, "app", "crons")];
			const onConfigFileChange = (file: string) => {
				if (!configDirs.some((dir) => file.startsWith(dir + sep))) return;
				server.restart().catch((error: unknown) => server.config.logger.error(String(error)));
			};
			for (const dir of configDirs) server.watcher.add(dir);
			server.watcher.on("add", onConfigFileChange);
			server.watcher.on("change", onConfigFileChange);
			server.watcher.on("unlink", onConfigFileChange);
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
			config: (worker) => {
				const queues = queueConfig(state.queueFiles ?? []);
				const crons = cronConfig(state.cronSchedules ?? []);
				const scheduled = [...queues.triggers, ...crons.triggers];
				return {
					env: {
						...(state.envSchema && envBindings(state.envSchema)),
						...queues.env,
						...worker.env,
					} as never,
					...(scheduled.length > 0 ? { triggers: scheduled as never } : {}),
				};
			},
		}),
	];
}
