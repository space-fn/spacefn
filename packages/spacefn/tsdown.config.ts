import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/runtime.ts", "src/vite.ts"],
	format: "esm",
	dts: true,
	clean: true,
	fixedExtension: false,
});
