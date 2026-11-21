import { defineConfig, mergeConfig } from "vitest/config";

import vite from "./vite.ts";

// The app's Vite config, so tests get the spacefn plugin (and spacefn/assets) too.
export default mergeConfig(
	vite,
	defineConfig({ test: { include: ["{app,lib,modules}/**/*.test.ts"] } }),
);
