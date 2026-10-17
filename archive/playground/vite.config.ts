import { db } from "@spacefn/db/vite";
import { space } from "@spacefn/server/vite";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [...space(), await db({ dialect: "sqlite" })],
});
