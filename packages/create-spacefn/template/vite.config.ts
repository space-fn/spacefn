import { resolve } from "node:path";

import { space } from "spacefn/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
	plugins: [space()],
	test: {
		include: ["**/*.test.ts"],
	},
	fmt: {
		useTabs: true,
		sortImports: true,
		sortPackageJson: true,
		sortTailwindcss: true,
		trailingComma: "all",
	},
	lint: {
		rules: {
			"no-unused-vars": "error",
			"typescript/no-deprecated": "error",
		},
		options: { typeAware: true, typeCheck: true },
	},
	resolve: {
		alias: {
			"@space": resolve(process.cwd(), ".space"),
			"@app": resolve(process.cwd(), "app"),
			"@modules": resolve(process.cwd(), "modules"),
			"@utils": resolve(process.cwd(), "utils"),
			"@lib": resolve(process.cwd(), "lib"),
		},
	},
});
