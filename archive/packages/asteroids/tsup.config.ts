import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/hono.ts", "src/vite.ts"],
	format: ["esm"],
	// Inline @spacefn/* types so the published declarations match the zero-dependency bundle
	dts: {
		resolve: [
			"@spacefn/html",
			"@spacefn/css",
			"@spacefn/db",
			"@spacefn/datastar",
			"@spacefn/vite-plugin",
		],
	},
	clean: true,
	// Bundle all @spacefn/* deps into dist — zero npm dependencies
	noExternal: [/@spacefn\//],
	// Keep hono as external (user provides it)
	external: ["hono"],
});
