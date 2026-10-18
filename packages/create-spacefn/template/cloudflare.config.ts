import { compatibilityDate, defineSpace } from "spacefn/cloudflare";

export default defineSpace({
	name: "spacefn-app",
	compatibilityDate: compatibilityDate(),
});
