// Type-level checks, enforced by `tsc`: the generated manifest rejects wrong exports.
import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { database } from "../src/db/database.ts";
import { html } from "../src/html.ts";
import { middleware } from "../src/http/middleware.ts";
import { route } from "../src/http/route.ts";
import { cron } from "../src/jobs/cron.ts";
import { queue } from "../src/jobs/queue.ts";
import type { SpaceManifest } from "../src/manifest.ts";
import { page } from "../src/pages/page.ts";

const base = { name: "todo", queues: [], crons: [], db: [] };
const at = { path: "/x", params: [], file: "app/routes/x.ts" } as const;

it("accepts route() and middleware() defaults", () => {
	const manifest = {
		...base,
		routes: [{ ...at, module: { default: route({ GET: Effect.succeed(1) }) } }],
		middleware: [
			{
				folder: "app/routes",
				file: "app/routes/_middleware.ts",
				module: { default: middleware((next) => next) },
			},
		],
	} as const satisfies SpaceManifest;
	expect(manifest.routes).toHaveLength(1);
});

it("rejects other defaults at compile time", () => {
	const routes = [
		// @ts-expect-error a route file must default-export route()
		{ ...at, module: { default: { GET: Effect.succeed(1) } } },
	] as const satisfies SpaceManifest["routes"];
	const chain = [
		{
			folder: "app/routes",
			file: "app/routes/_middleware.ts",
			// @ts-expect-error a _middleware.ts file must default-export middleware() or an array of them
			module: { default: (next: unknown) => next },
		},
	] as const satisfies SpaceManifest["middleware"];
	expect([routes, chain]).toHaveLength(2);
});

class MainDb extends database<MainDb, {}>()({ name: "main", migrations: [], queries: {} }) {}

it("accepts a generated database class and rejects anything else", () => {
	const db = [
		{ name: "main", driver: "d1", binding: "DB_MAIN", module: { default: MainDb } },
		// @ts-expect-error a db module must default-export its database class
		{ name: "other", driver: "d1", binding: "DB_OTHER", module: { default: {} } },
	] as const satisfies SpaceManifest["db"];
	expect(db).toHaveLength(2);
});

it("accepts page() for page files and rejects anything else", () => {
	const routes = [
		{ ...at, module: { default: page({ render: () => html`<p>hi</p>` }) } },
		// @ts-expect-error a page file must default-export page()
		{ ...at, module: { default: { render: () => html`` } } },
	] as const satisfies SpaceManifest["routes"];
	expect(routes).toHaveLength(2);
});

it("accepts queue(), cron() and a Layer, and rejects anything else", () => {
	const queues = [
		{
			name: "a",
			binding: "QUEUE_A",
			file: "app/queues/a.ts",
			module: { default: queue({ body: Schema.String, handler: () => Effect.void }) },
		},
		{
			name: "b",
			binding: "QUEUE_B",
			file: "app/queues/b.ts",
			// @ts-expect-error a queue file must default-export queue()
			module: { default: () => Effect.void },
		},
	] as const satisfies SpaceManifest["queues"];
	const crons = [
		{ name: "a", file: "app/crons/a.ts", module: { default: cron("0 3 * * *", Effect.void) } },
		// @ts-expect-error a cron file must default-export cron()
		{ name: "b", file: "app/crons/b.ts", module: { default: Effect.void } },
	] as const satisfies SpaceManifest["crons"];
	expect([queues, crons]).toHaveLength(2);
});
