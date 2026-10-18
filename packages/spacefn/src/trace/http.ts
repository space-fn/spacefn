import type { MiddlewareHandler } from "hono";
import { routePath } from "hono/route";

import { parseTraceparent } from "./context";
import { getTracer, withSpan } from "./span";

/**
 * Wraps each request in a server span named `METHOD /route`. A valid incoming
 * `traceparent` makes the request part of the caller's trace. The span is
 * flushed with `waitUntil`, so the response never waits for export.
 */
export function traceRequest(): MiddlewareHandler {
	return async (c, next) => {
		const parent = parseTraceparent(c.req.header("traceparent"));
		await withSpan(
			c.req.method,
			async (span) => {
				span.setAttributes({ "http.request.method": c.req.method, "url.path": c.req.path });
				await next();
				span.setName(`${c.req.method} ${routePath(c)}`);
				span.setAttributes({ "http.response.status_code": c.res.status });
				if (c.res.status >= 500) span.setError(`HTTP ${c.res.status}`);
			},
			{ kind: "server", parent },
		);

		const tracer = getTracer();
		const flush = tracer?.flush?.bind(tracer);
		if (flush) {
			try {
				c.executionCtx.waitUntil(flush.call(getTracer()));
			} catch {
				// Without an ExecutionContext (tests, direct calls) there is nothing to wait for.
			}
		}
	};
}
