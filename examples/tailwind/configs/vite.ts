import tailwindcss from "@tailwindcss/vite";
import { space } from "spacefn/vite";
import { defineConfig } from "vite";

// Tailwind's plugin beside spacefn's: it finds the classes in app/, modules/ and lib/
// (everything that isn't gitignored), and builds app/assets/site.css with them.
export default defineConfig({ plugins: [tailwindcss(), space({ target: "bun" })] });
