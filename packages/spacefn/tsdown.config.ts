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
	// The builds run in parallel; `pnpm build` empties dist/ first.
	clean: false,
	deps: { neverBundle: [/^spacefn(\/|$)/] },
});

export default defineConfig([
	area({
		index: "src/index.ts",
		testing: "src/testing.ts",
		assets: "src/assets.ts",
		"codegen/index": "src/codegen/index.ts",
		runtime: "src/runtime.ts",
		"sql/index": "src/sql/index.ts",
		"sql/node/index": "src/sql/node/index.ts",
	}),
	area({ "cloudflare/index": "src/cloudflare/index.ts" }, "tsconfig.cloudflare.json"),
	area({ "bun/index": "src/bun/index.ts" }, "tsconfig.bun.json"),
	area({
		vite: "src/infra/vite.ts",
		"infra/index": "src/infra/index.ts",
		"infra/cli": "src/infra/cli.ts",
		"infra/dev-bun": "src/infra/dev-bun.ts",
		"infra/cloudflare": "src/infra/cloudflare.ts",
		"infra/docker": "src/infra/docker.ts",
	}),
]);
