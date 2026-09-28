import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/hono.ts", "src/vite.ts"],
	format: ["esm"],
	dts: true,
	clean: true,
	// Bundle all @spacefn/* deps into dist — zero npm dependencies
	noExternal: [/@spacefn\//],
	// Keep hono as external (user provides it)
	external: ["hono"],
});
