import { defineConfig } from "vite-plus";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		coverage: {
			provider: "v8",
			thresholds: {
				statements: 80,
				branches: 79,
				functions: 79,
				lines: 80,
			},
		},
	},
	pack: {
		entry: [
			"src/index.ts",
			"src/runtime.ts",
			"src/vite.ts",
			"src/cloudflare.ts",
			"src/env.ts",
			"src/trace.ts",
			"src/queues.ts",
			"src/sync.ts",
			"src/crons.ts",
			"src/db.ts",
			"src/tenancy.ts",
			"src/auth.ts",
			"src/durable-objects.ts",
			"src/workflows.ts",
			"src/pages.ts",
			"src/cli.ts",
			"src/testing/index.ts",
		],
		format: "esm",
		dts: true,
		clean: true,
	},
});
