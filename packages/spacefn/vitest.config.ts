import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		// The Cloudflare tests bundle a worker and start Miniflare.
		testTimeout: 30_000,
	},
});
