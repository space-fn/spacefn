import { space } from "spacefn/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// Solid's own Vite plugin, beside spacefn's: it compiles the components that
// app/assets/ entries import. Pages stay server-rendered html.
export default defineConfig({ plugins: [solid(), space({ target: "bun" })] });
