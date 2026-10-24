import { defineSpace, compatibilityDate, bindings } from "spacefn/cloudflare";

export default defineSpace({
	name: "spacefn-app",
	compatibilityDate: compatibilityDate(new Date("2026-10-19")),
	env: {
		DB: bindings.d1({ name: "spacefn-app-db" }),
	},
});
