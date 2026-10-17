import { resolve, sep } from "node:path";

import { cloudflare, type PluginConfig } from "@cloudflare/vite-plugin";
import type { Plugin, PluginOption } from "vite";

import { envBindings } from "./cloudflare";
import type { Schema } from "./env/fields";
import { loadEnvSchema } from "./env/load";
import type { Mode } from "./routes/scan";
import { sync } from "./sync";

export interface SpaceState {
	/** The schema from `env.ts`, loaded when Vite resolves its config. */
	envSchema?: Schema;
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
			config: (worker) => ({
				env: { ...(state.envSchema && envBindings(state.envSchema)), ...worker.env } as never,
			}),
		}),
	];
}
