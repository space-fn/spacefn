import { afterEach, describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";

import { httpLayer } from "../src/http/app.ts";
import { csrf, isSameSite, type CsrfOptions } from "../src/http/csrf.ts";
import { route } from "../src/http/route.ts";

let dispose: (() => Promise<void>) | undefined;
afterEach(() => dispose?.());

const serve = (options?: CsrfOptions) => {
	const app = HttpRouter.toWebHandler(
		httpLayer({
			routes: [
				{
					path: "/todos",
					params: [],
					file: "app/routes/todos.ts",
					module: {
						default: route({ GET: Effect.succeed("list"), POST: Effect.succeed("created") }),
					},
				},
			],
			middleware: [{ file: "app/middleware/csrf.ts", module: { default: csrf(options) } }],
		}).pipe(Layer.provide(HttpServer.layerServices)),
		{ disableLogger: true },
	);
	dispose = app.dispose;
	return async (method: string, headers: Record<string, string> = {}) =>
		(await app.handler(new Request("http://app.test/todos", { method, headers }))).status;
};

describe("csrf", () => {
	it("refuses cross-site changes and allows same-site ones", async () => {
		const send = serve();
		expect(await send("POST", { origin: "https://evil.test" })).toBe(403);
		expect(await send("POST", { "sec-fetch-site": "cross-site" })).toBe(403);
		expect(await send("POST", { origin: "http://app.test" })).toBe(200);
		expect(await send("POST", { "sec-fetch-site": "same-origin" })).toBe(200);
		expect(await send("GET", { origin: "https://evil.test" })).toBe(200);
	});

	it("lets API clients without browser signals through, unless they carry the session", async () => {
		const send = serve({ cookie: "session" });
		expect(await send("POST")).toBe(200);
		expect(await send("POST", { cookie: "session=abc" })).toBe(403);
	});

	it("accepts extra origins", async () => {
		expect(
			await serve({ origins: ["https://admin.test"] })("POST", { origin: "https://admin.test" }),
		).toBe(200);
	});
});

describe("isSameSite", () => {
	it("prefers Origin over Sec-Fetch-Site", () => {
		expect(
			isSameSite({ origin: "https://a.test", secFetchSite: "same-origin" }, "https://b.test", []),
		).toBe(false);
		expect(isSameSite({ secFetchSite: "none" }, "https://b.test", [])).toBe(true);
	});
});
