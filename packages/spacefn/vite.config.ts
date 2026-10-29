import { defineConfig } from "vite-plus";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		coverage: {
			provider: "v8",
			thresholds: {
				statements: 78,
				branches: 75,
				functions: 77,
				lines: 79,
			},
		},
	},
	pack: {
		entry: [
			"src/handler.ts",
			"src/middleware.ts",
			"src/html.ts",
			"src/http.ts",
			"src/ws.ts",
			"src/sse.ts",
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
