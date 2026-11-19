import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/cli.ts", "src/vite.ts"],
	format: "esm",
	dts: true,
	clean: true,
});
