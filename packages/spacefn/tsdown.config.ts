import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"src/sql/index.ts",
		"src/sql/node/index.ts",
		"src/index.ts",
		"src/space-config.ts",
		"src/testing.ts",
		"src/codegen/index.ts",
		"src/runtime.ts",
	],
	format: "esm",
	dts: true,
	clean: true,
});
