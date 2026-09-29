import { cloudflare } from "@cloudflare/vite-plugin";
import { apiGenerator, pageGenerator, dbGenerator } from "@spacefn/asteroids/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [apiGenerator(), pageGenerator(), dbGenerator(), cloudflare()],
});
