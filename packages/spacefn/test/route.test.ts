import { afterEach, describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServer } from "effect/http";

import { NotFound } from "../src/errors.ts";
import { Input } from "../src/http/input.ts";
import { route, routesLayer } from "../src/http/route.ts";
import type { ManifestRoute } from "../src/manifest.ts";

const entry = (path: `/${string}`, value: unknown, catchAll?: string): ManifestRoute => ({
	kind: "route",
	path,
	params: [],
	...(catchAll ? { catchAll } : {}),
	file: `app/routes${path}.ts`,
	module: { default: value },
});

let dispose: (() => Promise<void>) | undefined;
afterEach(() => dispose?.());

const serve = (routes: readonly ManifestRoute[]) => {
	const app = HttpRouter.toWebHandler(
		routesLayer(routes).pipe(Layer.provide(HttpServer.layerServices)),
		{ disableLogger: true },
	);
	dispose = app.dispose;
	return async (path: string, init?: RequestInit) => {
		const response = await app.handler(new Request(`http://app.test${path}`, init));
		return { status: response.status, headers: response.headers, body: await response.text() };
	};
};

const todos = route({
	GET: Effect.gen(function* () {
		const { id } = yield* Input.params(Schema.Struct({ id: Schema.FiniteFromString }));
		if (id === 404) return yield* new NotFound({ message: `No todo ${id}` });
		return { id };
	}),
	DELETE: Effect.succeed(undefined),
});

describe("routesLayer", () => {
	it("serves each method's value and answers typed errors", async () => {
		const fetch = serve([entry("/todos/:id", todos)]);
		expect(await fetch("/todos/7")).toMatchObject({ status: 200, body: '{"id":7}' });
		expect(await fetch("/todos/404")).toMatchObject({
			status: 404,
			body: '{"error":"NotFound","message":"No todo 404"}',
		});
		expect((await fetch("/todos/7", { method: "DELETE" })).status).toBe(204);
	});

	it("answers params that do not decode with 404", async () => {
		const fetch = serve([entry("/todos/:id", todos)]);
		expect((await fetch("/todos/abc")).status).toBe(404);
	});

	it("answers an unhandled method with 405 and Allow", async () => {
		const fetch = serve([entry("/todos/:id", todos)]);
		const response = await fetch("/todos/7", { method: "POST" });
		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("GET, DELETE");
	});

	it("reports a catch-all under its own name and decodes the query", async () => {
		const files = route({
			GET: Effect.gen(function* () {
				const { path } = yield* Input.params(Schema.Struct({ path: Schema.String }));
				const { size } = yield* Input.query(
					Schema.Struct({ size: Schema.optional(Schema.Literals(["s", "l"])) }),
				);
				return { path, size: size ?? null };
			}),
		});
		const fetch = serve([entry("/files/*", files, "path")]);
		expect((await fetch("/files/a/b.png?size=l")).body).toBe('{"path":"a/b.png","size":"l"}');
		const bad = await fetch("/files/a.png?size=xl");
		expect(bad.status).toBe(400);
		expect(JSON.parse(bad.body)).toMatchObject({ error: "BadRequest", message: "Invalid query" });
	});

	it.effect("fails at startup when a file does not export a route", () =>
		Effect.gen(function* () {
			for (const [value, message] of [
				[{ GET: Effect.succeed(1) }, "not a route"],
				[route({}), "no handlers"],
			] as const) {
				const error = yield* Layer.build(
					routesLayer([entry("/x", value)]).pipe(Layer.provide(HttpRouter.layer)),
				).pipe(Effect.scoped, Effect.flip);
				expect(error).toMatchObject({ code: "ROUTE_EXPORT", file: "app/routes/x.ts" });
				expect(error.message).toContain(message);
			}
		}),
	);
});
