import type { Context, MiddlewareHandler } from "hono";

import {
	hashSessionToken,
	isSessionActive,
	readCookie,
	type SessionPolicy,
	type SessionRecord,
} from "./session";

export interface SessionOptions<Env, User> {
	/** Cookie name. Defaults to `session`. */
	cookie?: string;
	policy?: SessionPolicy;
	/** Finds the session and its user by token hash. */
	lookup: (env: Env, tokenHash: string) => Promise<(SessionRecord & { user: User }) | undefined>;
}

/**
 * Reads the session cookie and attaches `session` and `user` to the context.
 * An absent, unknown or expired session leaves both unset; it does not refuse
 * the request. Pair it with `requireSession()` where sign-in is needed.
 */
export function sessionResolver<Env extends object, User>(
	options: SessionOptions<Env, User>,
): MiddlewareHandler<{ Bindings: Env; Variables: { user?: User } }> {
	return async (c, next) => {
		const token = readCookie(c.req.header("cookie"), options.cookie);
		if (token) {
			const session = await options.lookup(c.env, await hashSessionToken(token));
			if (session && isSessionActive(session, Date.now(), options.policy)) {
				c.set("user", session.user);
			}
		}
		await next();
	};
}

/** Refuses a request with no signed-in user, with 401. */
export function requireSession(): MiddlewareHandler {
	return async (c: Context, next) => {
		if (c.get("user") === undefined) {
			return c.json({ error: "unauthorized", message: "Sign in first" }, 401);
		}
		await next();
	};
}

/**
 * Convenience wrapper around `sessionResolver` for the common D1-backed
 * session table. `lookup` receives the binding and the token hash.
 */
export function createSessionMiddleware<Env extends object, User>(options: {
	cookie?: string;
	policy?: SessionPolicy;
	lookup: (env: Env, tokenHash: string) => Promise<(SessionRecord & { user: User }) | undefined>;
}): MiddlewareHandler<{ Bindings: Env; Variables: { user?: User } }> {
	return sessionResolver<Env, User>(options);
}
