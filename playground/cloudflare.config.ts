import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "playground",
		entrypoint: "./.space/worker.ts",
		compatibilityDate: "2026-10-01",
	},
});
