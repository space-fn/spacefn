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
				"// Built to dist/server/index.js, beside dist/client.",
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
 * `.space/vite.config.ts`: the app's own `configs/vite.ts`, for Alchemy, which
 * roots Vite in `.space/` and looks for a `vite.config.ts` there.
 */
export const renderViteConfig = (): string =>
	[
		GENERATED,
		"// Alchemy looks for vite.config.ts where it runs Vite. The config is the app's: configs/vite.ts.",
		'export { default } from "../configs/vite.ts";',
		"",
	].join("\n");

/**
 * `.space/alchemy.run.ts`: the infra, as data for spacefn's stack,
 * plus `configs/env.ts` (its variables are passed on) and `configs/infra.ts`.
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
					folders: plan.folders,
				}
			: {
					name: plan.name,
					db: plan.db.map(({ driver, binding }) => ({ driver, binding })),
					folders: plan.folders,
				};
	const stack = plan.target === "cloudflare" ? "cloudflareStack" : "dockerStack";
	const fields = Object.entries(app).map(([key, value]) => `\t\t${key}: ${str(value)},`);
	return [
		GENERATED,
		`import { ${stack} } from "spacefn/infra/${plan.target === "cloudflare" ? "cloudflare" : "docker"}";`,
		...(plan.env ? ['import env from "../configs/env.ts";'] : []),
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
