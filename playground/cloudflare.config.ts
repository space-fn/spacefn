import { bindings, defineSpace, exports } from "spacefn/cloudflare";

export default defineSpace({
	name: "playground",
	compatibilityDate: "2026-10-01",
	exports: {
		Counter: exports.durableObject({ storage: "sqlite" }),
	},
	env: {
		COUNTER: bindings.durableObject({ worker: "playground", exportName: "Counter" }),
		DB: bindings.d1({ name: "playground-db" }),
		BACKUPS: bindings.r2({ name: "playground-backups" }),
	},
});
