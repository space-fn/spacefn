import { Hono } from "hono";
import { expect, test } from "vitest";

import { defineHandler } from "../src/index";
import { mountRoute } from "../src/runtime";

test("mounts each exported method", async () => {
	const app = new Hono();
	mountRoute(app, "/users/:id", {
		GET: defineHandler((c) => ({ id: c.req.param("id") })),
		DELETE: defineHandler(() => undefined),
	});

	const get = await app.request("/users/7");
	expect(await get.json()).toEqual({ id: "7" });
	expect((await app.request("/users/7", { method: "DELETE" })).status).toBe(204);
	expect((await app.request("/users/7", { method: "POST" })).status).toBe(404);
});

test("rejects a module without method exports", () => {
	expect(() => mountRoute(new Hono(), "/x", {})).toThrow("exports no HTTP method handlers");
});
