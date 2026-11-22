import { space } from "spacefn/vite";
import { defineConfig } from "vite";

/** Lightning CSS's browser versions: major << 16. */
const version = (major: number) => major << 16;

// Vite runs CSS through Lightning CSS instead of PostCSS: it bundles the @imports,
// and lowers nesting, custom media and light-dark() for these browsers.
export default defineConfig({
	css: {
		transformer: "lightningcss",
		lightningcss: {
			targets: { chrome: version(109), firefox: version(115), safari: version(15) },
			drafts: { customMedia: true },
		},
	},
	build: { cssMinify: "lightningcss" },
	plugins: [space({ target: "bun" })],
});
