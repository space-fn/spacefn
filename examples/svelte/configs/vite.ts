import { svelte } from "@sveltejs/vite-plugin-svelte";
import { space } from "spacefn/vite";
import { defineConfig } from "vite";

// Svelte's own Vite plugin, beside spacefn's: it compiles the components that
// islands are. Pages stay server-rendered html.
export default defineConfig({
	plugins: [svelte({ configFile: false }), space({ target: "cloudflare" })],
});
