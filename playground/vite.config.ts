import { resolve } from "node:path";

import { space } from "spacefn/vite";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  plugins: lazyPlugins(() => [space()]),
  resolve: {
    alias: {
      "@space": resolve(process.cwd(), ".space"),
      "@app": resolve(process.cwd(), "app"),
      "@modules": resolve(process.cwd(), "modules"),
      "@utils": resolve(process.cwd(), "utils"),
      "@lib": resolve(process.cwd(), "lib"),
    },
  },
});
