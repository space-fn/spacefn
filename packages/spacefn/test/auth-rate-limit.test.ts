import { Hono } from "hono";
import { expect, test, vi } from "vitest";

import { memoryRateStore, rateLimit } from "../src/auth";

function appWith(limit: number, windowMs = 60_000) {
	const app = new Hono();
	app.use(rateLimit({ store: memoryRateStore(), limit, windowMs }));
	app.post("/login", (c) => c.text("ok"));
	return app;
}

const from = (ip: string) => ({ method: "POST", headers: { "cf-connecting-ip": ip } });

test("allows up to the limit, then refuses with 429 and Retry-After", async () => {
	const app = appWith(2);
	expect((await app.request("/login", from("1.1.1.1"))).status).toBe(200);
	expect((await app.request("/login", from("1.1.1.1"))).status).toBe(200);
	const refused = await app.request("/login", from("1.1.1.1"));
	expect(refused.status).toBe(429);
	expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
	expect(await refused.json()).toEqual({ error: "rate_limited", message: "Too many requests" });
});

test("counts each client separately", async () => {
	const app = appWith(1);
	expect((await app.request("/login", from("1.1.1.1"))).status).toBe(200);
	expect((await app.request("/login", from("2.2.2.2"))).status).toBe(200);
	expect((await app.request("/login", from("1.1.1.1"))).status).toBe(429);
});

test("the window resets after it ends", async () => {
	vi.useFakeTimers();
	try {
		vi.setSystemTime(0);
		const app = appWith(1, 1000);
		expect((await app.request("/login", from("3.3.3.3"))).status).toBe(200);
		expect((await app.request("/login", from("3.3.3.3"))).status).toBe(429);
		vi.setSystemTime(1000);
		expect((await app.request("/login", from("3.3.3.3"))).status).toBe(200);
	} finally {
		vi.useRealTimers();
	}
});

test("a request with no client address shares one bucket", async () => {
	const app = appWith(1);
	expect((await app.request("/login", { method: "POST" })).status).toBe(200);
	expect((await app.request("/login", { method: "POST" })).status).toBe(429);
});
