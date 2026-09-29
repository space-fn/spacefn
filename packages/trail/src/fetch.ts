import { currentTrail, type TrailResolver } from "./scope.js";
import { formatTraceparent } from "./traceparent.js";

export interface TrailFetchOptions {
	/** Defaults to the ambient `currentTrail()`. */
	resolve?: TrailResolver;
	/** Defaults to the global `fetch`. */
	fetch?: typeof globalThis.fetch;
}

/**
 * Wrap `fetch` so outbound calls become `http.client` spans under the ambient
 * trail and continue the trace on the receiving service through `traceparent`.
 * The response is returned unchanged; a 5xx marks the span as failed but never
 * throws into the app.
 *
 * ```ts
 * const fetch = trailFetch();
 * await fetch("https://api.example.com/things");
 * ```
 */
export function trailFetch(options: TrailFetchOptions = {}): typeof globalThis.fetch {
	const resolve = options.resolve ?? currentTrail;
	const realFetch = options.fetch ?? globalThis.fetch;
	return async (input, init) => {
		const trail = resolve();
		if (!trail) return realFetch(input, init);
		const method = (
			init?.method ?? (input instanceof Request ? input.method : "GET")
		).toUpperCase();
		const url = input instanceof Request ? input.url : String(input);
		let host = url;
		try {
			host = new URL(url).host;
		} catch {
			// Relative or unparsable URL: keep the raw value.
		}
		const span = trail.startSpan(`${method} ${host}`, "http.client");
		span.set("http.method", method);
		span.set("http.host", host);
		const headers = new Headers(
			init?.headers ?? (input instanceof Request ? input.headers : undefined),
		);
		headers.set(
			"traceparent",
			formatTraceparent({ traceId: trail.traceId, spanId: span.spanId, sampled: true }),
		);
		try {
			const res = await realFetch(input, { ...init, headers });
			span.set("http.status", res.status);
			if (res.status >= 500) span.setError(new Error(`HTTP ${res.status}`));
			return res;
		} catch (error) {
			span.setError(error);
			throw error;
		} finally {
			span.end();
		}
	};
}
