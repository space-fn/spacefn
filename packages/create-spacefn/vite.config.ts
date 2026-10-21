import { defineConfig } from "vite-plus";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
	},
	pack: {
		entry: ["src/index.ts", "src/scaffold.ts"],
		format: "esm",
		dts: true,
		clean: true,
		fixedExtension: false,
	},
});
