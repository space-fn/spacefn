import { defineConfig, type UserConfig } from "tsdown";

/**
 * One build per area, each typed with its runtime's globals. The targets
 * import the core by name (`spacefn`, `spacefn/runtime`), so they share the
 * core's files instead of bundling a copy.
 */
const area = (entry: Record<string, string>, tsconfig = "tsconfig.json"): UserConfig => ({
	entry,
	tsconfig,
	format: "esm",
	dts: true,
	clean: false,
	deps: { neverBundle: [/^spacefn(\/|$)/] },
});

export default defineConfig([
	{
		...area({
			index: "src/index.ts",
			"space-config": "src/space-config.ts",
			testing: "src/testing.ts",
			"codegen/index": "src/codegen/index.ts",
			runtime: "src/runtime.ts",
			"sql/index": "src/sql/index.ts",
			"sql/node/index": "src/sql/node/index.ts",
		}),
		clean: true,
	},
	area({ "cloudflare/index": "src/cloudflare/index.ts" }, "tsconfig.cloudflare.json"),
]);
