import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		entrypoint: "./app/entry.ts",
		name: "spacefn-app",
		compatibilityDate: "2026-10-19",
	},
});
