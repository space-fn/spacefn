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

// --- Pages -------------------------------------------------------------------

describe("pages", () => {
	it("GET page with loader returns rendered HTML", async () => {
		const handler = createServer({
			routes: [],
			pages: [
				{
					pattern: "/",
					loader: async () => ({ msg: "Hello" }),
					page: (data: unknown) => `<h1>${(data as { msg: string }).msg}</h1>`,
				},
			],
		});

		const response = await handler(new Request("http://localhost/"));
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/html");
		expect(await response.text()).toBe("<h1>Hello</h1>");
	});

	it("GET page without loader renders page with undefined data", async () => {
		const handler = createServer({
			routes: [],
			pages: [
				{
					pattern: "/",
					page: () => "<p>Static</p>",
				},
			],
		});

		const response = await handler(new Request("http://localhost/"));
		expect(await response.text()).toBe("<p>Static</p>");
	});

	it("POST action returns JSON response", async () => {
		const handler = createServer({
			routes: [],
			pages: [
				{
					pattern: "/signup",
					actions: {
						signup: {
							resolver: async (payload) => {
								return { success: true, email: (payload as { email: string }).email };
							},
						},
					},
					page: () => "<form></form>",
				},
			],
		});

		const response = await handler(
			new Request("http://localhost/signup?_action=signup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: "test@example.com" }),
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true, email: "test@example.com" });
	});

	it("POST unknown action returns 400", async () => {
		const handler = createServer({
			routes: [],
			pages: [
				{
					pattern: "/",
					actions: {
						signup: { resolver: async () => ({ ok: true }) },
					},
				},
			],
		});

		const response = await handler(
			new Request("http://localhost/?_action=unknown", { method: "POST" }),
		);
		expect(response.status).toBe(400);
	});

	it("POST without _action param returns 400", async () => {
		const handler = createServer({
			routes: [],
			pages: [
				{
					pattern: "/",
					actions: {
						signup: { resolver: async () => ({ ok: true }) },
					},
				},
			],
		});

		const response = await handler(new Request("http://localhost/", { method: "POST" }));
		expect(response.status).toBe(400);
	});

	it("POST action with input validation rejects invalid data", async () => {
		const handler = createServer({
			routes: [],
			pages: [
				{
					pattern: "/signup",
					actions: {
						signup: {
							input: {
								safeParse: (data: unknown) => {
									const d = data as Record<string, unknown>;
									if (typeof d?.email === "string" && d.email.includes("@")) {
										return { success: true, data: d };
									}
									return { success: false, data: { issues: ["Invalid email"] } };
								},
							},
							resolver: async (payload) => ({ email: (payload as { email: string }).email }),
						},
					},
				},
			],
		});

		const response = await handler(
			new Request("http://localhost/signup?_action=signup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: "not-an-email" }),
			}),
		);
		expect(response.status).toBe(400);
	});

	it("POST action with form data parsing", async () => {
		const handler = createServer({
			routes: [],
			pages: [
				{
					pattern: "/login",
					actions: {
						login: {
							resolver: async (payload) => {
								const data = payload as Record<string, string>;
								return { user: data.username };
							},
						},
					},
				},
			],
		});

		const formData = new URLSearchParams({ username: "admin", password: "secret" });
		const response = await handler(
			new Request("http://localhost/login?_action=login", {
				method: "POST",
				body: formData,
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ user: "admin" });
	});
});
