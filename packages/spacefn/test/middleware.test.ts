import { afterEach, describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";

import { Unauthorized } from "../src/errors.ts";
import { httpLayer } from "../src/http/app.ts";
import { middleware } from "../src/http/middleware.ts";
import { route } from "../src/http/route.ts";
import type { ManifestMiddleware, ManifestRoute } from "../src/manifest.ts";

let dispose: (() => Promise<void>) | undefined;
afterEach(() => dispose?.());

const at = (path: `/${string}`, file: string): ManifestRoute => ({
	path,
	params: [],
	file,
	module: { default: route({ GET: Effect.succeed(path.slice(1)) }) },
});

const hello = at("/hello", "app/routes/hello.ts");

/** A `_middleware.ts` in `folder` (under app/routes). */
const use = (folder: string, value: unknown) =>
	({
		folder,
		file: `${folder}/_middleware.ts`,
		module: { default: value },
	}) as unknown as ManifestMiddleware;

const serve = (mw: readonly ManifestMiddleware[], routes: readonly ManifestRoute[] = [hello]) => {
	const app = HttpRouter.toWebHandler(
		httpLayer({ routes, middleware: mw }).pipe(Layer.provide(HttpServer.layerServices)),
		{ disableLogger: true },
	);
	dispose = app.dispose;
	return async (path: string, headers?: Record<string, string>) => {
		const response = await app.handler(new Request(`http://app.test${path}`, { headers }));
		return { status: response.status, headers: response.headers, body: await response.text() };
	};
};

const trace = (name: string) =>
	middleware((next) =>
		Effect.map(next, (response) =>
			HttpServerResponse.setHeader(
				response,
				"x-trace",
				`${name}${response.headers["x-trace"] ? `,${response.headers["x-trace"]}` : ""}`,
			),
		),
	);

describe("middleware", () => {
	it("runs an exported array in order, the first outermost", async () => {
		const fetch = serve([use("app/routes", [trace("a"), trace("b")])]);
		const response = await fetch("/hello");
		expect(response.body).toBe("hello");
		expect(response.headers.get("x-trace")).toBe("a,b");
	});

	it("wraps a folder's routes in its _middleware.ts, inside the outer folders'", async () => {
		const fetch = serve(
			[
				use("app/routes/admin/users", trace("users")),
				use("app/routes", trace("root")),
				use("app/routes/admin", [trace("admin")]),
			],
			[
				hello,
				at("/admin/stats", "app/routes/admin/stats.ts"),
				at("/admin/users/list", "app/routes/admin/users/list.ts"),
				// A sibling whose name starts the same is not in the folder.
				at("/administrators", "app/routes/administrators.ts"),
			],
		);
		expect((await fetch("/hello")).headers.get("x-trace")).toBe("root");
		expect((await fetch("/admin/stats")).headers.get("x-trace")).toBe("root,admin");
		expect((await fetch("/admin/users/list")).headers.get("x-trace")).toBe("root,admin,users");
		expect((await fetch("/administrators")).headers.get("x-trace")).toBe("root");
	});

	it("can answer without calling next, and its failures become responses", async () => {
		const guard = middleware((next) =>
			Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest;
				if (request.headers["x-key"] !== "ok")
					return yield* new Unauthorized({ message: "No key" });
				return yield* next;
			}),
		);
		const fetch = serve([use("app/routes", guard)]);
		expect(await fetch("/hello")).toMatchObject({
			status: 401,
			body: '{"error":"Unauthorized","message":"No key"}',
		});
		expect((await fetch("/hello", { "x-key": "ok" })).body).toBe("hello");
	});

	it("wraps every method of a route in its handle, inside the folders' middleware", async () => {
		const both: ManifestRoute = {
			path: "/admin/both",
			params: [],
			file: "app/routes/admin/both.ts",
			module: {
				default: route({
					handle: trace("route"),
					GET: Effect.succeed("got"),
					POST: Effect.succeed("posted"),
				}),
			},
		};
		const fetch = serve([use("app/routes/admin", trace("admin"))], [both]);
		expect(await fetch("/admin/both")).toMatchObject({ body: "got" });
		expect((await fetch("/admin/both")).headers.get("x-trace")).toBe("admin,route");
		const app = HttpRouter.toWebHandler(
			httpLayer({ routes: [both], middleware: [] }).pipe(Layer.provide(HttpServer.layerServices)),
			{ disableLogger: true },
		);
		const posted = await app.handler(new Request("http://app.test/admin/both", { method: "POST" }));
		expect(await posted.text()).toBe("posted");
		expect(posted.headers.get("x-trace")).toBe("route");
		const put = await app.handler(new Request("http://app.test/admin/both", { method: "PUT" }));
		expect(put.status).toBe(405);
		expect(put.headers.get("x-trace")).toBeNull();
		await app.dispose();
	});

	it("answers an unknown path with a JSON 404, with middleware installed", async () => {
		const fetch = serve([use("app/routes", trace("a"))]);
		const response = await fetch("/nope");
		expect(response.status).toBe(404);
		expect(JSON.parse(response.body)).toMatchObject({ error: "NotFound" });
	});

	it.effect("fails at startup when a file does not export middleware, at any depth", () =>
		Effect.gen(function* () {
			for (const [folder, value] of [
				["app/routes", () => {}],
				["app/routes/admin", [trace("a"), "nope"]],
				["app/routes/admin", []],
			] as const) {
				const error = yield* Layer.build(
					httpLayer({ routes: [], middleware: [use(folder, value)] }).pipe(
						Layer.provide(HttpRouter.layer),
					),
				).pipe(Effect.scoped, Effect.flip);
				expect(error).toMatchObject({
					code: "MIDDLEWARE_EXPORT",
					file: `${folder}/_middleware.ts`,
				});
			}
		}),
	);
});
