import { defineSpace, compatibilityDate } from "spacefn/cloudflare";

export default defineSpace({
	name: "spacefn-app",
	compatibilityDate: compatibilityDate(),
});
