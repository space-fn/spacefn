import { SqliteClient } from "@effect/sql-sqlite-node";
import { afterEach, describe, expect, it } from "@effect/vitest";
import { Cause, Context, Effect, Layer, Option } from "effect";
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/http";
import { Reactivity } from "effect/reactivity";

import { databases, DbConnector } from "../src/app-layer.ts";
import { app, appServices } from "../src/app.ts";
import { transactional } from "../src/db/connection.ts";
import { database } from "../src/db/database.ts";
import { NotFound } from "../src/errors.ts";
import { httpLayer } from "../src/http/app.ts";
import { middleware } from "../src/http/middleware.ts";
import { errorPage, OnError } from "../src/http/respond.ts";
import { route } from "../src/http/route.ts";
import { staticFiles, StaticFiles } from "../src/http/static.ts";
import type { ManifestDb, ManifestMiddleware, ManifestRoute } from "../src/manifest.ts";

const manifest = { name: "app", routes: [], middleware: [], queues: [], crons: [], db: [] };

const at = (path: `/${string}`, value: unknown): ManifestRoute => ({
	path,
	params: [],
	file: `app/routes${path}.ts`,
	module: { default: value as ManifestRoute["module"]["default"] },
});

const tag = (name: string) =>
	middleware((next) =>
		Effect.map(next, (response) =>
			HttpServerResponse.setHeader(
				response,
				"x-trace",
				`${name}${response.headers["x-trace"] ? `,${response.headers["x-trace"]}` : ""}`,
			),
		),
	);

let dispose: (() => Promise<void>) | undefined;
afterEach(() => dispose?.());

/** Serves `routes` as an app's entry would, with `services` and `extra` options. */
const serve = (
	routes: readonly ManifestRoute[],
	services: Layer.Any = Layer.empty,
	extra: Parameters<typeof httpLayer>[2] = {},
	mw: readonly ManifestMiddleware[] = [],
) => {
	const handler = HttpRouter.toWebHandler(
		httpLayer({ routes, middleware: mw }, services as Layer.Layer<any, unknown>, extra).pipe(
			Layer.provide(HttpServer.layerServices),
		),
		{ disableLogger: true },
	);
	dispose = handler.dispose;
	return (path: string, init?: RequestInit) =>
		handler.handler(new Request(`http://app.test${path}`, init));
};

describe("app()", () => {
	it.effect("gives each service the ones listed before it", () =>
		Effect.gen(function* () {
			class First extends Context.Service<First, number>()("test/First") {}
			class Second extends Context.Service<Second, number>()("test/Second") {}
			const services = appServices(
				app(manifest, {
					services: [
						Layer.succeed(First, 1),
						Layer.effect(
							Second,
							Effect.gen(function* () {
								return (yield* First) + 1;
							}),
						),
					],
				}),
			);
			const both = yield* Effect.gen(function* () {
				return [yield* First, yield* Second];
			}).pipe(Effect.provide(services));
			expect(both).toEqual([1, 2]);
		}),
	);

	it("answers failures with onError, for routes and for URLs nothing serves", async () => {
		const services = appServices(
			app(manifest, {
				onError: (cause) =>
					Effect.succeed(
						HttpServerResponse.text(
							`sorry: ${Option.match(Cause.findErrorOption(cause), {
								onNone: () => "defect",
								onSome: (error) => (error as { _tag: string })._tag,
							})}`,
							{ status: 418 },
						),
					),
			}),
		);
		const fetch = serve(
			[at("/gone", route({ GET: Effect.fail(new NotFound({ message: "x" })) }))],
			services,
		);
		for (const path of ["/gone", "/nothing-here"]) {
			const response = await fetch(path);
			expect([response.status, await response.text()]).toEqual([418, "sorry: NotFound"]);
		}
	});

	it("keeps errorPage as the default onError", async () => {
		expect(appServices(app(manifest))).toBeDefined();
		const fetch = serve([at("/gone", route({ GET: Effect.fail(new NotFound({ message: "x" })) }))]);
		const response = await fetch("/gone");
		expect(response.status).toBe(404);
		expect(OnError.defaultValue()).toBe(errorPage);
	});

	it("runs before outside app/routes/_middleware.ts, and serves extra router layers", async () => {
		const fetch = serve(
			[at("/hello", route({ GET: Effect.succeed("hello") }))],
			Layer.empty,
			{
				before: [tag("before")],
				routes: [HttpRouter.add("GET", "/extra", Effect.succeed(HttpServerResponse.text("extra")))],
			},
			[
				{
					folder: "app/routes",
					file: "app/routes/_middleware.ts",
					module: { default: tag("root") },
				},
			],
		);
		expect((await fetch("/hello")).headers.get("x-trace")).toBe("before,root");
		const extra = await fetch("/extra");
		expect([await extra.text(), extra.headers.get("x-trace")]).toEqual(["extra", "before,root"]);
	});
});

describe("staticFiles()", () => {
	const files = Layer.succeed(StaticFiles, {
		lookup: async (method, path) =>
			method === "GET" && path === "/assets/app.js" ? new Response("console.log(1)") : undefined,
	});
	const routes = [at("/assets/other", route({ GET: Effect.succeed("from the app") }))];

	it("answers with the target's file, and lets every other request through", async () => {
		const fetch = serve(routes, files, { before: [staticFiles()] });
		expect(await (await fetch("/assets/app.js")).text()).toBe("console.log(1)");
		expect(await (await fetch("/assets/other")).text()).toBe("from the app");
	});

	it("does nothing where the target has no static files", async () => {
		const fetch = serve(routes, Layer.empty, { before: [staticFiles()] });
		expect((await fetch("/assets/app.js")).status).toBe(404);
	});
});

describe("databases()", () => {
	const queries = {
		count: {
			mode: "one",
			columns: { n: "number" },
			parts: [{ sql: "SELECT count(*) AS n FROM notes", params: [], gate: null }],
		},
	} as const;
	interface Queries {
		count: { params: Record<string, never>; row: { readonly n: number }; mode: "one" };
	}
	const migrations = [{ id: "0001_notes", sql: "CREATE TABLE notes (id INTEGER PRIMARY KEY);" }];
	class NotesDb extends database<NotesDb, Queries>()({ name: "notes", migrations, queries }) {}

	const entry = (driver: ManifestDb["driver"]) =>
		({ name: "notes", driver, binding: "DB_NOTES", module: { default: NotesDb } }) as const;
	// Opened in the layer's scope, as a target's connector opens D1 or libSQL.
	const connector = Layer.succeed(DbConnector, (db) =>
		db.driver === "durable-object"
			? undefined
			: SqliteClient.make({ filename: ":memory:" }).pipe(
					Effect.map(transactional),
					Effect.provide(Reactivity.layer),
				),
	);

	it.effect("connects each database through the target's DbConnector, migrated", () =>
		Effect.gen(function* () {
			expect(yield* (yield* NotesDb).count()).toEqual(Option.some({ n: 0 }));
		}).pipe(Effect.provide(databases({ db: [entry("libsql")] }).pipe(Layer.provide(connector)))),
	);

	it.effect("leaves a manual database to the app", () =>
		Effect.gen(function* () {
			expect(Option.isNone(yield* Effect.serviceOption(NotesDb))).toBe(true);
		}).pipe(
			Effect.provide(
				databases({ db: [{ ...entry("libsql"), open: "manual" }] }).pipe(Layer.provide(connector)),
			),
		),
	);

	it.effect("leaves out a database the target doesn't connect", () =>
		Effect.gen(function* () {
			expect(Option.isNone(yield* Effect.serviceOption(NotesDb))).toBe(true);
		}).pipe(
			Effect.provide(databases({ db: [entry("durable-object")] }).pipe(Layer.provide(connector))),
		),
	);
});
