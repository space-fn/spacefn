import type { MiddlewareHandler } from "hono";

import { readCookie } from "./session";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfOptions {
	/** Other origins allowed to make changes, e.g. `https://app.example.com`. This app's own origin is always allowed. */
	origins?: string[];
	/** The session cookie name. A request without it carries no session, so it is not checked. */
	cookie?: string;
}

/** Decides whether a state-changing request really came from an allowed origin. */
export function isSameSiteRequest(
	headers: { origin?: string | null; secFetchSite?: string | null },
	requestOrigin: string,
	allowed: string[],
): boolean {
	const origin = headers.origin;
	if (origin) return origin === requestOrigin || allowed.includes(origin);
	return headers.secFetchSite === "same-origin" || headers.secFetchSite === "none";
}

/**
 * Refuses a cross-site state change that carries a session. Requests without a
 * session cookie are not browser sessions and are not checked. A browser always
 * sends `Origin` or `Sec-Fetch-Site`; a request with neither is refused.
 */
export function csrfGuard(options: CsrfOptions = {}): MiddlewareHandler {
	return async (c, next) => {
		if (
			SAFE.has(c.req.method) ||
			readCookie(c.req.header("cookie"), options.cookie) === undefined
		) {
			return next();
		}
		const allowed = isSameSiteRequest(
			{ origin: c.req.header("origin"), secFetchSite: c.req.header("sec-fetch-site") },
			new URL(c.req.url).origin,
			options.origins ?? [],
		);
		if (!allowed) return c.json({ error: "forbidden", message: "Cross-site request refused" }, 403);
		return next();
	};
}
