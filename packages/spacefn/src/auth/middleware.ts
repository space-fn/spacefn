import type { Context, MiddlewareHandler } from "hono";

import {
	hashSessionToken,
	isSessionActive,
	readCookie,
	type SessionPolicy,
	type SessionRecord,
} from "./session";

/** How stale `lastSeenAt` may grow before a request refreshes it. */
const TOUCH_AFTER_MS = 60 * 60 * 1000;

export interface SessionOptions<Env, User> {
	/** Cookie name. Defaults to `session`. */
	cookie?: string;
	policy?: SessionPolicy;
	/** Finds the session and its user by token hash. */
	lookup: (env: Env, tokenHash: string) => Promise<(SessionRecord & { user: User }) | undefined>;
	/**
	 * Writes `lastSeenAt` for the session so the idle timeout slides. Called at
	 * most once an hour. Without it the idle clock runs from the last write,
	 * which is usually the sign-in.
	 */
	touch?: (env: Env, tokenHash: string, lastSeenAt: number) => Promise<void>;
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
			const tokenHash = await hashSessionToken(token);
			const session = await options.lookup(c.env, tokenHash);
			const now = Date.now();
			if (session && isSessionActive(session, now, options.policy)) {
				c.set("user", session.user);
				if (options.touch && now - session.lastSeenAt >= TOUCH_AFTER_MS) {
					await options.touch(c.env, tokenHash, now);
				}
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
	touch?: (env: Env, tokenHash: string, lastSeenAt: number) => Promise<void>;
}): MiddlewareHandler<{ Bindings: Env; Variables: { user?: User } }> {
	return sessionResolver<Env, User>(options);
}
