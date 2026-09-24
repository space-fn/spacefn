import { space } from "@spacefn/server/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [...space(), tsconfigPaths()],
});
