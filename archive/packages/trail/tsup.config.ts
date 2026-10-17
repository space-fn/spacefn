import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/hono.ts", "src/kysely.ts", "src/client.ts"],
	format: ["esm"],
	dts: true,
	clean: true,
	// hono and kysely are optional peer deps (type-only usage in source)
	external: ["hono", "kysely"],
});
