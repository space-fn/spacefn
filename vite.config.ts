import { defineConfig } from "vite-plus";

export default defineConfig({
	staged: {
		"*": "vp check --fix",
	},
	fmt: {
		useTabs: true,
		sortImports: true,
		sortPackageJson: true,
		sortTailwindcss: true,
		trailingComma: "all",
	},
	lint: {
		jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
		rules: {
			"no-unused-vars": "error",
			"typescript/no-deprecated": "error",
			"vite-plus/prefer-vite-plus-imports": "error",
		},
		options: { typeAware: true, typeCheck: true },
	},
});
