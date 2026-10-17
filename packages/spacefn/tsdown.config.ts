import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/runtime.ts",
		"src/vite.ts",
		"src/cloudflare.ts",
		"src/env.ts",
		"src/trace.ts",
		"src/queues.ts",
	],
	format: "esm",
	dts: true,
	clean: true,
	fixedExtension: false,
});
