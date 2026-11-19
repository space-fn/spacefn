import type { AppPlan } from "./plan.ts";
import { fromSpace, GENERATED } from "./render-manifest.ts";

const str = JSON.stringify;

/**
 * The runtime entry for the target. Cloudflare gets one Worker module that also
 * exports the Durable Object and workflow classes. Bun gets a fetch-handler
 * module (`app.ts`, which the Vite dev server loads) and a production server
 * (`server.ts`, bundled by `vite build`).
 */
export const renderEntries = (plan: AppPlan): Record<string, string> => {
	if (plan.target === "bun")
		return {
			"app.ts": [
				GENERATED,
				'import { app } from "@spacefn/bun";',
				'import { manifest } from "./manifest.ts";',
				"",
				"export default app(manifest);",
				"",
			].join("\n"),
			"server.ts": [
				GENERATED,
				'import { serve } from "@spacefn/bun";',
				'import app from "./app.ts";',
				"",
				"serve(app);",
				"",
			].join("\n"),
		};

	const classes = [...plan.durableObjects, ...plan.workflows].map(
		(unit) => `export { default as ${unit.className} } from ${str(fromSpace(unit.file))};`,
	);
	return {
		"entry.ts": [
			GENERATED,
			'import { worker } from "@spacefn/cloudflare";',
			'import { manifest } from "./manifest.ts";',
			"",
			"export default worker(manifest);",
			...classes,
			"",
		].join("\n"),
	};
};

/**
 * `.space/vite.config.ts`: the user's `configs/vite.config.ts` (object or
 * function form) merged with the spacefn plugin. Alchemy and `space dev` both
 * load this file, so no Vite config sits in the app root.
 */
export const renderViteConfig = (plan: AppPlan): string => {
	const options = [
		`target: ${str(plan.target)}`,
		'root: fileURLToPath(new URL("..", import.meta.url))',
		`client: ${str(plan.client)}`,
		`aliases: ${str(plan.aliases)}`,
	];
	const spacePlugin = `{ plugins: [space({ ${options.join(", ")} })] }`;
	const imports = [
		'import { fileURLToPath } from "node:url";',
		"",
		'import { space } from "@spacefn/infra/vite";',
		`import { defineConfig${plan.viteConfig ? ", mergeConfig" : ""} } from "vite";`,
		...(plan.viteConfig ? ['import user from "../configs/vite.config.ts";'] : []),
	];
	const body = plan.viteConfig
		? [
				"export default defineConfig(async (env) =>",
				`\tmergeConfig(typeof user === "function" ? await user(env) : await user, ${spacePlugin}),`,
				");",
			]
		: [`export default defineConfig(${spacePlugin});`];
	return [GENERATED, ...imports, "", ...body, ""].join("\n");
};

/**
 * `.space/tsconfig.json`: the import aliases as `paths`. The app's
 * `configs/tsconfig.json` extends it, so aliases are declared once, in
 * `configs/space.ts`.
 */
export const renderTsconfig = (plan: AppPlan): string => {
	const paths = Object.fromEntries(
		Object.entries(plan.aliases).map(([alias, dir]) => [`${alias}/*`, [`../${dir}/*`]]),
	);
	return `${JSON.stringify({ compilerOptions: { paths } }, null, "\t")}\n`;
};
