import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		// Shiki loads its grammars on the first render.
		testTimeout: 30_000,
	},
});
