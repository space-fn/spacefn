import type { AppPlan } from "./plan.ts";
import { fromSpace, GENERATED } from "./render-manifest.ts";

const str = JSON.stringify;

/**
 * The runtime entry for the target. Cloudflare gets one Worker module that also
 * exports the Durable Object and workflow classes, spacefn's own included. Bun gets a fetch-handler
 * module (`app.ts`, which the Vite dev server loads) and a production server
 * (`server.ts`, bundled by `vite build`).
 */
export const renderEntries = (plan: AppPlan): Record<string, string> => {
	if (plan.target === "bun")
		return {
			"app.ts": [
				GENERATED,
				'import { app } from "spacefn/bun";',
				'import { manifest } from "./manifest.ts";',
				"",
				"export default app(manifest);",
				"",
			].join("\n"),
			"server.ts": [
				GENERATED,
				'import { dirname, join } from "node:path";',
				'import { fileURLToPath } from "node:url";',
				"",
				'import { serve } from "spacefn/bun";',
				'import app from "./app.ts";',
				"",
				"// Built to .space/dist/server/index.js, beside .space/dist/client.",
				'await serve(app, { client: join(dirname(fileURLToPath(import.meta.url)), "..", "client") });',
				"",
			].join("\n"),
		};

	const classes = [...plan.durableObjects, ...plan.workflows].map(
		(unit) => `export { default as ${unit.className} } from ${str(fromSpace(unit.file))};`,
	);
	return {
		"entry.ts": [
			GENERATED,
			'import { worker } from "spacefn/cloudflare";',
			'import { manifest } from "./manifest.ts";',
			"",
			"export default worker(manifest);",
			"// The Durable Objects behind Bus and RateLimiter.",
			'export { SpaceBus, SpaceRateLimiter } from "spacefn/cloudflare";',
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
	const paths = Object.fromEntries([
		// Generated modules app code imports, e.g. `@space/db/main.ts`.
		["@space/*", ["./*"]],
		...Object.entries(plan.aliases).map(([alias, dir]) => [`${alias}/*`, [`../${dir}/*`]]),
	]);
	return `${JSON.stringify({ compilerOptions: { paths } }, null, "\t")}\n`;
};

/** `.space/assets.d.ts`: the type of `@space/assets`, which the Vite plugin provides. */
export const renderAssetsTypes = (): string =>
	[
		GENERATED,
		'import type { Html } from "spacefn";',
		"",
		"/**",
		" * The `<script>` and `<link>` tags for the `app/client/` entries: the source",
		" * files in dev, the hashed build files in production. Put it in `<head>`.",
		" */",
		"export declare const head: Html;",
		"",
	].join("\n");

/**
 * `.space/alchemy.run.ts`: the infra, as data for `@spacefn/infra`'s stack,
 * plus `app/env.ts` (its variables are passed on) and `configs/infra.ts`.
 * Alchemy runs it for `space dev` on Cloudflare and for deploys.
 */
export const renderAlchemy = (plan: AppPlan): string => {
	const app =
		plan.target === "cloudflare"
			? {
					name: plan.name,
					db: plan.db.map(({ driver, binding }) => ({ driver, binding })),
					queues: plan.queues.map(({ name, binding }) => ({ name, binding })),
					crons: [...new Set(plan.crons.map((cron) => cron.schedule))],
					durableObjects: plan.durableObjects.map(({ className, binding }) => ({
						className,
						binding,
					})),
					workflows: plan.workflows.map(({ className, binding }) => ({ className, binding })),
					uses: plan.uses,
					folders: Object.values(plan.aliases),
				}
			: {
					name: plan.name,
					db: plan.db.map(({ driver, binding }) => ({ driver, binding })),
					folders: Object.values(plan.aliases),
				};
	const stack = plan.target === "cloudflare" ? "cloudflareStack" : "dockerStack";
	const fields = Object.entries(app).map(([key, value]) => `\t\t${key}: ${str(value)},`);
	return [
		GENERATED,
		`import { ${stack} } from "@spacefn/infra/${plan.target === "cloudflare" ? "cloudflare" : "docker"}";`,
		...(plan.env ? ['import env from "../app/env.ts";'] : []),
		...(plan.infraConfig ? ['import infra from "../configs/infra.ts";'] : []),
		"",
		`export default ${stack}(`,
		"\t{",
		fields[0]!,
		"\t\trootDir: import.meta.dirname,",
		...fields.slice(1),
		"\t},",
		`\t{${[plan.env ? " env" : "", plan.infraConfig ? " infra" : ""].filter(Boolean).join(",")}${plan.env || plan.infraConfig ? " " : ""}},`,
		");",
		"",
	].join("\n");
};
