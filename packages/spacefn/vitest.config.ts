import { defineConfig } from "vitest/config";

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
});
