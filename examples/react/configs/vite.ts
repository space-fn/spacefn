import react from "@vitejs/plugin-react";
import { space } from "spacefn/vite";
import { defineConfig } from "vite";

// React's own Vite plugin, beside spacefn's: it compiles the components that
// islands are. Pages stay server-rendered html.
export default defineConfig({ plugins: [react(), space({ target: "bun" })] });
