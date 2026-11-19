import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/cli.ts",
		"src/vite.ts",
		"src/cloudflare.ts",
		"src/docker.ts",
		"src/dev-bun.ts",
	],
	format: "esm",
	dts: true,
	clean: true,
});
