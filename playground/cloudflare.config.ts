import { defineSpace, compatibilityDate } from "spacefn/cloudflare";

export default defineSpace({
	name: "spacefn-app",
	compatibilityDate: compatibilityDate(new Date("2026-10-19")),
});
