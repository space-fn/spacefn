import { join, resolve, sep } from "node:path";

import { cloudflare, type PluginConfig } from "@cloudflare/vite-plugin";
import type { Plugin, PluginOption } from "vite";

import { envBindings } from "./cloudflare";
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
			await sync(root, mode);
		},

		configureServer(server) {
			const routesDir = resolve(root, "routes");
			server.watcher.add(routesDir);

			const onChange = (file: string) => {
				if (!file.startsWith(routesDir + sep)) return;
				sync(root, mode).catch((error: unknown) => server.config.logger.error(String(error)));
			};
			server.watcher.on("add", onChange);
			server.watcher.on("unlink", onChange);

			// Bindings come from env.ts when Vite resolves its config, so a change needs a restart.
			const envFile = resolve(root, "env.ts");
			const onEnvChange = (file: string) => {
				if (file !== envFile) return;
				server.restart().catch((error: unknown) => server.config.logger.error(String(error)));
			};
			server.watcher.on("add", onEnvChange);
			server.watcher.on("change", onEnvChange);
			server.watcher.on("unlink", onEnvChange);

			// Adding or removing a queue file adds or removes a binding and a consumer trigger.
			const queuesDir = resolve(root, "queues");
			const onQueueChange = (file: string) => {
				if (!file.startsWith(queuesDir + sep)) return;
				server.restart().catch((error: unknown) => server.config.logger.error(String(error)));
			};
			server.watcher.add(queuesDir);
			server.watcher.on("add", onQueueChange);
			server.watcher.on("unlink", onQueueChange);
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
				return {
					env: {
						...(state.envSchema && envBindings(state.envSchema)),
						...queues.env,
						...worker.env,
					} as never,
					...(queues.triggers.length > 0 ? { triggers: queues.triggers as never } : {}),
				};
			},
		}),
	];
}
