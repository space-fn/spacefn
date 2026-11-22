import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/scaffold.ts"],
	format: "esm",
	dts: true,
	// Until TypeScript 7.1 is released (it is in beta); then remove.
	suppressWarnings: ["The `tsgo` generator on TypeScript 7.0 is deprecated"],
	clean: true,
	fixedExtension: false,
});
