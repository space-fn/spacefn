import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { HttpServerResponse } from "effect/http";

import { hashSessionToken, sessionAuth, type SessionRecord } from "../src/auth/session.ts";
import { route, type RouteMethods } from "../src/http/route.ts";
import { testHttp } from "../src/testing.ts";

const DAY = 24 * 60 * 60 * 1000;

const setup = () => {
	const sessions = new Map<string, SessionRecord<{ name: string }>>();
	const calls = { lookup: 0, touch: 0 };
	const auth = sessionAuth({
		lookup: (tokenHash) =>
			Effect.sync(() => {
				calls.lookup++;
				return Option.fromNullishOr(sessions.get(tokenHash));
			}),
		touch: (tokenHash, lastSeenAt) =>
			Effect.sync(() => {
				calls.touch++;
				const found = sessions.get(tokenHash);
				if (found) sessions.set(tokenHash, { ...found, lastSeenAt });
			}),
	});
	const at = (path: `/${string}`, methods: RouteMethods) => ({
		kind: "route" as const,
		path,
		params: [],
		file: `app/routes${path}.ts`,
		module: { default: route(methods) },
	});
	const app = testHttp({
		routes: [
			at("/sign-in", {
				POST: Effect.gen(function* () {
					const session = yield* auth.create;
					sessions.set(session.tokenHash, {
						user: { name: "Ada" },
						expiresAt: session.expiresAt,
						lastSeenAt: Date.now(),
					});
					return auth.signIn(HttpServerResponse.empty({ status: 204 }), session.token);
				}),
			}),
			at("/me", {
				GET: Effect.gen(function* () {
					yield* auth.user; // a second read uses the cached lookup
					return yield* auth.requireUser;
				}),
			}),
			at("/sign-out", {
				POST: Effect.gen(function* () {
					const tokenHash = yield* auth.currentTokenHash;
					if (tokenHash) sessions.delete(tokenHash);
					return auth.signOut(HttpServerResponse.empty({ status: 204 }));
				}),
			}),
		],
	});
	return { app, sessions, calls };
};

const tokenOf = (response: Response) =>
	/session=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1] ?? "";

describe("sessionAuth", () => {
	it("signs in with a hardened cookie and stores only the token hash", async () => {
		const { app, sessions } = setup();
		const response = await app.fetch("/sign-in", { method: "POST" });
		const cookie = response.headers.get("set-cookie") ?? "";
		expect(cookie).toMatch(
			/^session=[A-Za-z0-9_-]{43}; Max-Age=2592000; Path=\/; HttpOnly; Secure; SameSite=Lax$/,
		);
		const token = tokenOf(response);
		expect([...sessions.keys()]).toEqual([await Effect.runPromise(hashSessionToken(token))]);
		expect(sessions.has(token)).toBe(false);
		await app.dispose();
	});

	it("resolves the user once per request and refuses requests without a session", async () => {
		const { app, calls } = setup();
		const token = tokenOf(await app.fetch("/sign-in", { method: "POST" }));
		const me = await app.fetch("/me", { headers: { cookie: `session=${token}` } });
		expect(await me.json()).toEqual({ name: "Ada" });
		expect(calls.lookup).toBe(1);
		expect((await app.fetch("/me")).status).toBe(401);
		expect((await app.fetch("/me", { headers: { cookie: "session=not-a-token" } })).status).toBe(
			401,
		);
		await app.dispose();
	});

	it("ends sessions past their absolute or idle limit, and slides the idle clock", async () => {
		const { app, sessions, calls } = setup();
		const token = tokenOf(await app.fetch("/sign-in", { method: "POST" }));
		const [hash, record] = [...sessions][0]!;
		const me = () => app.fetch("/me", { headers: { cookie: `session=${token}` } });

		sessions.set(hash, { ...record, lastSeenAt: Date.now() - 2 * 60 * 60 * 1000 });
		expect((await me()).status).toBe(200);
		expect(calls.touch).toBe(1);
		expect(sessions.get(hash)!.lastSeenAt).toBeGreaterThan(Date.now() - 1000);

		sessions.set(hash, { ...record, lastSeenAt: Date.now() - 8 * DAY });
		expect((await me()).status).toBe(401);
		sessions.set(hash, { ...record, expiresAt: Date.now() - 1 });
		expect((await me()).status).toBe(401);
		await app.dispose();
	});

	it("signs out by expiring the cookie", async () => {
		const { app, sessions } = setup();
		const token = tokenOf(await app.fetch("/sign-in", { method: "POST" }));
		const out = await app.fetch("/sign-out", {
			method: "POST",
			headers: { cookie: `session=${token}` },
		});
		expect(out.headers.get("set-cookie")).toMatch(/^session=; Max-Age=0; .*Path=\//);
		expect(sessions.size).toBe(0);
		await app.dispose();
	});
});
