import { Hono } from "hono";
import { expect, test } from "vitest";

import { csrfGuard, isSameSiteRequest } from "../src/auth";

const app = () => {
	const a = new Hono();
	a.use(csrfGuard({ origins: ["https://app.example.com"] }));
	a.all("/", (c) => c.text("done"));
	return a;
};
const session = { cookie: "session=abc" };
const origin = "http://localhost:5199";

test("a same-origin browser post with a session goes through", async () => {
	const res = await app().request(origin + "/", {
		method: "POST",
		headers: { ...session, origin },
	});
	expect(res.status).toBe(200);
});

test("a cross-site post with a session is refused", async () => {
	const res = await app().request(origin + "/", {
		method: "POST",
		headers: { ...session, origin: "https://evil.test" },
	});
	expect(res.status).toBe(403);
});

test("an explicitly allowed origin goes through", async () => {
	const res = await app().request(origin + "/", {
		method: "POST",
		headers: { ...session, origin: "https://app.example.com" },
	});
	expect(res.status).toBe(200);
});

test("without an Origin, Sec-Fetch-Site decides", async () => {
	const ok = await app().request(origin + "/", {
		method: "POST",
		headers: { ...session, "sec-fetch-site": "same-origin" },
	});
	const bad = await app().request(origin + "/", {
		method: "POST",
		headers: { ...session, "sec-fetch-site": "cross-site" },
	});
	const none = await app().request(origin + "/", { method: "POST", headers: session });
	expect([ok.status, bad.status, none.status]).toEqual([200, 403, 403]);
});

test("safe methods and requests without a session are not checked", async () => {
	expect(
		(
			await app().request(origin + "/", {
				method: "GET",
				headers: { ...session, origin: "https://evil.test" },
			})
		).status,
	).toBe(200);
	expect(
		(
			await app().request(origin + "/", {
				method: "POST",
				headers: { origin: "https://evil.test" },
			})
		).status,
	).toBe(200);
});

test("isSameSiteRequest prefers the Origin header", () => {
	expect(
		isSameSiteRequest({ origin: "https://evil.test", secFetchSite: "same-origin" }, origin, []),
	).toBe(false);
	expect(isSameSiteRequest({ origin: origin }, origin, [])).toBe(true);
	expect(isSameSiteRequest({}, origin, [])).toBe(false);
});
