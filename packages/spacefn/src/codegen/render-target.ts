import { type AppPlan, clientEntryName } from "./plan.ts";
import { fromSpace, GENERATED } from "./render-manifest.ts";

const str = JSON.stringify;

/** Imported by the generated entries: the app as `app/entry.ts` describes it. */
const ENTRY = 'import entry from "../app/entry.ts";';

/**
 * The runtime entry for the target, running `app/entry.ts`. Cloudflare gets
 * one Worker module that also exports the Durable Object and workflow
 * classes, spacefn's own included. Bun gets a fetch-handler module (`app.ts`,
 * which the Vite dev server loads) and a production server (`server.ts`,
 * bundled by `vite build`).
 */
export const renderEntries = (plan: AppPlan): Record<string, string> => {
	if (plan.target === "bun")
		return {
			"app.ts": [
				GENERATED,
				'import { bunApp } from "spacefn/bun";',
				ENTRY,
				"",
				"export default bunApp(entry);",
				"",
			].join("\n"),
			"server.ts": [
				GENERATED,
				'import { dirname, join } from "node:path";',
				'import { fileURLToPath } from "node:url";',
				"",
				'import { serve } from "spacefn/bun";',
				ENTRY,
				"",
				"// Built to dist/server/index.js, beside dist/client.",
				'await serve(entry, { client: join(dirname(fileURLToPath(import.meta.url)), "..", "client") });',
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
			ENTRY,
			"",
			"export default worker(entry);",
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

/** A list for `.space/infra.ts`, one item a line. */
const list = (items: readonly unknown[]) =>
	items.length === 0 ? "[]" : `[\n${items.map((item) => `\t\t${str(item)},`).join("\n")}\n\t]`;

/**
 * `.space/infra.ts`: what the file conventions ask of the infra, as plain
 * data, for the loops in `configs/infra.ts`. It imports no app code, so a
 * deploy doesn't load the app in Node.
 */
export const renderInfra = (plan: AppPlan): string => {
	const app = {
		name: plan.name,
		folders: plan.folders,
		databases: plan.db.map(({ name, binding, driver }) => ({ name, binding, driver })),
		queues: plan.queues.map(({ name, binding }) => ({ name, binding })),
		crons: [...new Set(plan.crons.map((cron) => cron.schedule))],
		durableObjects: plan.durableObjects.map(({ className, binding }) => ({ className, binding })),
		workflows: plan.workflows.map(({ className, binding }) => ({ className, binding })),
	};
	return [
		GENERATED,
		'import type { InfraApp } from "spacefn/infra";',
		"",
		"/** The app as configs/infra.ts loops over it: from package.json and app/. */",
		"export const app: InfraApp = {",
		...Object.entries(app).map(([key, value]) =>
			typeof value === "string" ? `\t${key}: ${str(value)},` : `\t${key}: ${list(value)},`,
		),
		"};",
		"",
	].join("\n");
};

/** `.space/assets.d.ts`: the client entries' names, so `assets("main")` is checked. */
export const renderAssetTypes = (plan: AppPlan): string =>
	[
		GENERATED,
		"export {};",
		"",
		'declare module "spacefn/assets" {',
		"\tinterface ClientEntries {",
		...plan.client.map((file) => `\t\t${str(clientEntryName(file))}: ${str(file)};`),
		"\t}",
		"}",
		"",
	].join("\n");
