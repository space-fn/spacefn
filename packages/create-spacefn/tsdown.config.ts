import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/scaffold.ts"],
	format: "esm",
	dts: true,
	clean: true,
	fixedExtension: false,
});
