// Type-level checks, enforced by `tsc`: the generated manifest rejects wrong exports.
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { database } from "../src/db/database.ts";
import { middleware } from "../src/http/middleware.ts";
import { route } from "../src/http/route.ts";
import type { SpaceManifest } from "../src/manifest.ts";

const base = { name: "todo", queues: [], crons: [], db: [] };
const at = { path: "/x", params: [], file: "app/routes/x.ts" } as const;

it("accepts route() and middleware() defaults", () => {
	const manifest = {
		...base,
		routes: [{ kind: "route", ...at, module: { default: route({ GET: Effect.succeed(1) }) } }],
		middleware: [{ file: "app/middleware/a.ts", module: { default: middleware((next) => next) } }],
	} as const satisfies SpaceManifest;
	expect(manifest.routes).toHaveLength(1);
});

it("rejects other defaults at compile time", () => {
	const routes = [
		// @ts-expect-error a route file must default-export route()
		{ kind: "route", ...at, module: { default: { GET: Effect.succeed(1) } } },
	] as const satisfies SpaceManifest["routes"];
	const chain = [
		// @ts-expect-error a middleware file must default-export middleware()
		{ file: "app/middleware/a.ts", module: { default: (next: unknown) => next } },
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
