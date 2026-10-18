import { compatibilityDate, defineSpace, exports, bindings } from "spacefn/cloudflare";

export default defineSpace({
	name: "playground",
	compatibilityDate: compatibilityDate(),
	exports: {
		Counter: exports.durableObject({ storage: "sqlite" }),
	},
	env: {
		COUNTER: bindings.durableObject({ worker: "playground", exportName: "Counter" }),
		DB: bindings.d1({ name: "playground-db" }),
		BACKUPS: bindings.r2({ name: "playground-backups" }),
	},
});
