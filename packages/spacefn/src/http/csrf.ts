import { Effect } from "effect";
import { HttpServerRequest } from "effect/http";

import { Forbidden } from "../errors.ts";
import { middleware, type Middleware } from "./middleware.ts";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfOptions {
	/** Other origins allowed to make changes, e.g. `https://admin.example.com`. The app's own origin always is. */
	readonly origins?: readonly string[];
	/** The session cookie. A request carrying it but no browser signals is refused. */
	readonly cookie?: string;
}

/** Whether a state-changing request's browser signals show it came from an allowed origin. */
export const isSameSite = (
	headers: { readonly origin?: string | undefined; readonly secFetchSite?: string | undefined },
	ownOrigin: string,
	allowed: readonly string[],
): boolean => {
	if (headers.origin) return headers.origin === ownOrigin || allowed.includes(headers.origin);
	return headers.secFetchSite === "same-origin" || headers.secFetchSite === "none";
};

/**
 * Refuses cross-site state changes with a 403. Browsers always send `Origin`
 * or `Sec-Fetch-Site`, and those must look same-site, session or not (which
 * also stops login CSRF). A request with neither header is refused only when
 * it carries the session cookie, so non-browser API clients keep working.
 *
 * ```ts
 * // app/middleware/1-csrf.ts
 * export default csrf({ cookie: "session" });
 * ```
 */
export const csrf = (options: CsrfOptions = {}): Middleware =>
	middleware((next) =>
		Effect.gen(function* () {
			const request = yield* HttpServerRequest.HttpServerRequest;
			if (SAFE.has(request.method)) return yield* next;
			const signals = {
				origin: request.headers["origin"],
				secFetchSite: request.headers["sec-fetch-site"],
			};
			const hasSignals = signals.origin !== undefined || signals.secFetchSite !== undefined;
			const hasSession =
				options.cookie !== undefined && request.cookies[options.cookie] !== undefined;
			if (!hasSignals && !hasSession) return yield* next;
			// `originalUrl` is absolute for web requests; the host header covers the rest.
			const own = new URL(request.originalUrl, `http://${request.headers["host"] ?? "localhost"}`)
				.origin;
			if (!isSameSite(signals, own, options.origins ?? []))
				return yield* new Forbidden({ message: "Cross-site request refused" });
			return yield* next;
		}),
	);
