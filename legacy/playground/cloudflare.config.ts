import { defineConfig, bindings } from "cf/config";

export default defineConfig({
	worker: {
		entrypoint: "./app/entry.ts",
		name: "spacefn-app",
		compatibilityDate: "2026-10-19",
		env: {
			DB: bindings.d1({ name: "spacefn-app-db" }),
			UPLOADS: bindings.r2({ name: "spacefn-app-uploads" }),
		},
	},
});
