import { defineConfig, mergeConfig } from "vitest/config";

import vite from "./vite.ts";

// The app's Vite config, so tests get the spacefn plugin (and spacefn/assets) too.
export default mergeConfig(
	vite,
	defineConfig({
		// vite-plugin-solid points Vitest at jsdom; these tests run the server.
		test: { include: ["{app,lib,modules}/**/*.test.ts"], environment: "node" },
	}),
);
