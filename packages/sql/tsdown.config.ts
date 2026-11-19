import { defineConfig } from "tsdown";

export default defineConfig({
	entry: { index: "src/index.ts", "node/index": "src/node/index.ts" },
	format: "esm",
	dts: true,
	clean: true,
});
