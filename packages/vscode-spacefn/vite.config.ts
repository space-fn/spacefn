import { defineConfig } from "vite-plus";

export default defineConfig({
	test: {
		include: ["server/src/**/*.test.ts"],
	},
});
