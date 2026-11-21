import vue from "@vitejs/plugin-vue";
import { space } from "spacefn/vite";
import { defineConfig } from "vite";

// Vue's own Vite plugin, beside spacefn's: it compiles the components that
// app/client/ entries import. Pages stay server-rendered html.
export default defineConfig({ plugins: [vue(), space({ target: "cloudflare" })] });
