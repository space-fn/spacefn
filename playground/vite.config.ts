import { cloudflare } from "@cloudflare/vite-plugin";
import { space } from "spacefn/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [space(), cloudflare()],
});
