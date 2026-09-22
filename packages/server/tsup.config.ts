import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/test.ts", "src/vite/index.ts"],
	format: ["esm"],
	dts: true,
	clean: true,
});
