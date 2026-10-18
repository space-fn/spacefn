import { Hono } from "hono";
import { expect, test } from "vite-plus/test";

import {
	clearSessionCookie,
	DEFAULT_SESSION_POLICY,
	hashSessionToken,
	isSessionActive,
	newSession,
	readCookie,
	requireSession,
	sessionCookie,
	sessionResolver,
} from "../src/auth";

const day = 24 * 60 * 60 * 1000;

test("a session token is random and only its hash is derived from it", async () => {
	const a = await newSession();
	const b = await newSession();
	expect(a.token).not.toBe(b.token);
	expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
	expect(a.tokenHash).not.toContain(a.token);
	expect(await hashSessionToken(a.token)).toBe(a.tokenHash);
});

test("a session ends at its absolute expiry or after sitting idle", () => {
	const now = 1_000_000_000_000;
	const fresh = { expiresAt: now + 30 * day, lastSeenAt: now };
	expect(isSessionActive(fresh, now)).toBe(true);
	expect(isSessionActive({ ...fresh, expiresAt: now }, now)).toBe(false);
	expect(isSessionActive({ ...fresh, lastSeenAt: now - DEFAULT_SESSION_POLICY.idleMs }, now)).toBe(
		false,
	);
});

test("the session cookie is HttpOnly, Secure and SameSite=Lax", () => {
	const cookie = sessionCookie("tok");
	expect(cookie).toContain("session=tok");
	expect(cookie).toContain("HttpOnly");
	expect(cookie).toContain("Secure");
	expect(cookie).toContain("SameSite=Lax");
	expect(sessionCookie("tok", { secure: false })).not.toContain("Secure");
	expect(clearSessionCookie()).toContain("Max-Age=0");
});

test("reads one cookie by name from a Cookie header", () => {
	expect(readCookie("theme=dark; session=abc123; other=x", "session")).toBe("abc123");
	expect(readCookie("session=a=b", "session")).toBe("a=b");
	expect(readCookie("theme=dark")).toBeUndefined();
	expect(readCookie(null)).toBeUndefined();
});

test("the resolver attaches the user for a valid session and leaves it unset otherwise", async () => {
	const token = (await newSession()).token;
	const tokenHash = await hashSessionToken(token);
	const now = Date.now();
	const app = new Hono<{ Bindings: object; Variables: { user?: { name: string } } }>();
	app.use(
		sessionResolver<object, { name: string }>({
			lookup: async (_env, hash) =>
				hash === tokenHash
					? { user: { name: "ada" }, expiresAt: now + day, lastSeenAt: now }
					: undefined,
		}),
	);
	app.get("/", (c) => c.json({ user: c.get("user") ?? null }));

	expect(
		await (await app.request("/", { headers: { cookie: `session=${token}` } })).json(),
	).toEqual({
		user: { name: "ada" },
	});
	expect(await (await app.request("/", { headers: { cookie: "session=forged" } })).json()).toEqual({
		user: null,
	});
	expect(await (await app.request("/")).json()).toEqual({ user: null });
});

test("requireSession refuses a request with no user", async () => {
	const app = new Hono();
	app.get("/private", requireSession(), (c) => c.text("secret"));
	const res = await app.request("/private");
	expect(res.status).toBe(401);
	expect(await res.json()).toEqual({ error: "unauthorized", message: "Sign in first" });
});
