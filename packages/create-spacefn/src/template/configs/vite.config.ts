import { cloudflare } from "@cloudflare/vite-plugin";
import { generators, apiGenerator, pageGenerator, dbGenerator } from "@spacefn/asteroids/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    ...generators(apiGenerator(), pageGenerator(), dbGenerator()),
    cloudflare(),
  ],
});
