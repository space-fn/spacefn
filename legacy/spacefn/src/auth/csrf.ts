import type { MiddlewareHandler } from "hono";

import { readCookie } from "./session";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfOptions {
	/** Other origins allowed to make changes, e.g. `https://app.example.com`. This app's own origin is always allowed. */
	origins?: string[];
	/** The session cookie name. A request carrying it with no browser signals is refused. */
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
 * Refuses a cross-site state change. A request that carries browser signals
 * (`Origin` or `Sec-Fetch-Site`) must look same-site, with or without a session:
 * that is what stops login CSRF. A request with neither signal is refused when it
 * carries a session cookie, and passed through otherwise, so non-browser API
 * clients still work. A browser always sends `Origin` or `Sec-Fetch-Site`.
 */
export function csrfGuard(options: CsrfOptions = {}): MiddlewareHandler {
	return async (c, next) => {
		if (SAFE.has(c.req.method)) return next();
		const headers = {
			origin: c.req.header("origin"),
			secFetchSite: c.req.header("sec-fetch-site"),
		};
		const hasSession = readCookie(c.req.header("cookie"), options.cookie) !== undefined;
		const hasBrowserSignals = headers.origin !== undefined || headers.secFetchSite !== undefined;
		if (!hasSession && !hasBrowserSignals) return next();
		const allowed = isSameSiteRequest(headers, new URL(c.req.url).origin, options.origins ?? []);
		if (!allowed) return c.json({ error: "forbidden", message: "Cross-site request refused" }, 403);
		return next();
	};
}
