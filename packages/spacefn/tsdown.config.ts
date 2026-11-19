import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/space-config.ts", "src/cli.ts"],
	format: "esm",
	dts: true,
	clean: true,
});
