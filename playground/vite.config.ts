import { resolve } from "node:path";

import { space } from "spacefn/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
	plugins: [space()],
	resolve: {
		alias: {
			"@modules": resolve(process.cwd(), "modules"),
			"@utils": resolve(process.cwd(), "utils"),
			"@lib": resolve(process.cwd(), "lib"),
		},
	},
});
