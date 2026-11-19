import type { UserConfig, UserConfigFnPromise } from "vite";
import { defineConfig, mergeConfig } from "vitest/config";

// The generated Vite config: the folder aliases, @space/* and @space/assets.
import space from "../.space/vite.config.ts";

export default defineConfig(async (env) => {
	const config = space as UserConfig | UserConfigFnPromise;
	return mergeConfig(typeof config === "function" ? await config(env) : config, {
		test: { include: ["app/**/*.test.ts", "lib/**/*.test.ts", "modules/**/*.test.ts"] },
	});
});
