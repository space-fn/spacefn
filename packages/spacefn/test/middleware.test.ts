import { afterEach, describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";

import { Unauthorized } from "../src/errors.ts";
import { httpLayer } from "../src/http/app.ts";
import { middleware } from "../src/http/middleware.ts";
import { route } from "../src/http/route.ts";
import type { ManifestModule, ManifestRoute } from "../src/manifest.ts";

let dispose: (() => Promise<void>) | undefined;
afterEach(() => dispose?.());

const hello: ManifestRoute = {
	kind: "route",
	path: "/hello",
	params: [],
	file: "app/routes/hello.ts",
	module: { default: route({ GET: Effect.succeed("hello") }) },
};

const use = (file: string, value: unknown): ManifestModule => ({
	file,
	module: { default: value },
});

const serve = (mw: readonly ManifestModule[]) => {
	const app = HttpRouter.toWebHandler(
		httpLayer({ routes: [hello], middleware: mw }).pipe(Layer.provide(HttpServer.layerServices)),
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
	it("runs files in order, the first outermost", async () => {
		const fetch = serve([
			use("app/middleware/1-a.ts", trace("a")),
			use("app/middleware/2-b.ts", trace("b")),
		]);
		const response = await fetch("/hello");
		expect(response.body).toBe("hello");
		expect(response.headers.get("x-trace")).toBe("a,b");
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
		const fetch = serve([use("app/middleware/auth.ts", guard)]);
		expect(await fetch("/hello")).toMatchObject({
			status: 401,
			body: '{"error":"Unauthorized","message":"No key"}',
		});
		expect((await fetch("/hello", { "x-key": "ok" })).body).toBe("hello");
	});

	it("answers an unknown path with a JSON 404, with middleware installed", async () => {
		const fetch = serve([use("app/middleware/trace.ts", trace("a"))]);
		const response = await fetch("/nope");
		expect(response.status).toBe(404);
		expect(JSON.parse(response.body)).toMatchObject({ error: "NotFound" });
	});

	it.effect("fails at startup when a file does not export a middleware", () =>
		Effect.gen(function* () {
			const error = yield* Layer.build(
				httpLayer({ routes: [], middleware: [use("app/middleware/x.ts", () => {})] }).pipe(
					Layer.provide(HttpRouter.layer),
				),
			).pipe(Effect.scoped, Effect.flip);
			expect(error).toMatchObject({ code: "MIDDLEWARE_EXPORT", file: "app/middleware/x.ts" });
		}),
	);
});
