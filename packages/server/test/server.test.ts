import { describe, it, expect } from "vitest";

import { createServer } from "../src/server.js";

// --- createServer ------------------------------------------------------------

describe("createServer", () => {
	it("returns a function", () => {
		const handler = createServer({ routes: [] });
		expect(typeof handler).toBe("function");
	});

	it("handles GET request to root route", async () => {
		const handler = createServer({
			routes: [
				{
					pattern: "/",
					method: "*",
					handler: async () => ({
						default: () => new Response("hello"),
					}),
				},
			],
		});

		const request = new Request("http://localhost/");
		const response = await handler(request);
		const text = await response.text();
		expect(text).toBe("hello");
	});

	it("handles method-specific routes", async () => {
		const handler = createServer({
			routes: [
				{
					pattern: "/api",
					method: "GET",
					handler: async () => ({
						default: () => Response.json({ method: "GET" }),
					}),
				},
				{
					pattern: "/api",
					method: "POST",
					handler: async () => ({
						default: () => Response.json({ method: "POST" }),
					}),
				},
			],
		});

		const getRes = await handler(new Request("http://localhost/api"));
		expect(await getRes.json()).toEqual({ method: "GET" });

		const postRes = await handler(new Request("http://localhost/api", { method: "POST" }));
		expect(await postRes.json()).toEqual({ method: "POST" });
	});

	it("handles dynamic segments", async () => {
		const handler = createServer({
			routes: [
				{
					pattern: "/users/:id",
					method: "*",
					handler: async () => ({
						default: () => new Response("user route"),
					}),
				},
			],
		});

		const response = await handler(new Request("http://localhost/users/42"));
		expect(response.status).toBe(200);
	});

	it("returns 404 for unmatched routes", async () => {
		const handler = createServer({ routes: [] });
		const response = await handler(new Request("http://localhost/nope"));
		expect(response.status).toBe(404);
	});

	it("runs middlewares", async () => {
		const order: string[] = [];

		const handler = createServer({
			routes: [
				{
					pattern: "/",
					method: "*",
					handler: async () => {
						order.push("handler");
						return { default: () => new Response("ok") };
					},
				},
			],
			middlewares: [
				{
					name: "test",
					handler: async (request, next) => {
						order.push("middleware");
						return next();
					},
				},
			],
		});

		await handler(new Request("http://localhost/"));
		expect(order).toContain("middleware");
	});

	it("catches errors from handlers", async () => {
		const handler = createServer({
			routes: [
				{
					pattern: "/",
					method: "*",
					handler: async () => ({
						default: () => {
							throw new Error("boom");
						},
					}),
				},
			],
		});

		const response = await handler(new Request("http://localhost/"));
		expect(response.status).toBe(500);
	});
});
