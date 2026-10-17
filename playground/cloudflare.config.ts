import { bindings, defineSpace, exports } from "spacefn/cloudflare";

export default defineSpace({
	name: "playground",
	compatibilityDate: "2026-10-01",
	entrypoint: "./entry.ts",
	exports: {
		Counter: exports.durableObject({ storage: "sqlite" }),
	},
	env: {
		COUNTER: bindings.durableObject({ worker: "playground", exportName: "Counter" }),
	},
});
