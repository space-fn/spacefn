import { resolve, sep } from "node:path";

import { cloudflare, type PluginConfig } from "@cloudflare/vite-plugin";
import type { Plugin, PluginOption } from "vite";

import type { Mode } from "./routes/scan";
import { sync } from "./sync";

/** Keeps `.space/` in step with the project's convention folders. */
export function spaceSync(): Plugin {
	let root = process.cwd();
	let mode: Mode = "dev";

	return {
		name: "space",

		async config(userConfig, env) {
			root = resolve(userConfig.root ?? process.cwd());
			mode = env.command === "serve" ? "dev" : "prod";
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
	cloudflare?: PluginConfig;
}

/** The one Vite plugin a spacefn app needs: folder sync plus the Cloudflare runtime. */
export function space(options: SpaceOptions = {}): PluginOption[] {
	return [spaceSync(), cloudflare(options.cloudflare)];
}
