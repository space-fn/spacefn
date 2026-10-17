import type { SpanContext } from "./span";
import { currentSpan, withSpan } from "./span";

/** Formats a W3C `traceparent` header for `context`. */
export function formatTraceparent(context: SpanContext): string {
	return `00-${context.traceId}-${context.spanId}-01`;
}

/**
 * `fetch` that records a client span and sends the current trace to the
 * callee. Only the host is recorded, never the full URL.
 */
export async function tracedFetch(
	input: RequestInfo | URL,
	init: RequestInit = {},
): Promise<Response> {
	const request = new Request(input, init);
	const url = new URL(request.url);
	return withSpan(
		`HTTP ${request.method} ${url.host}`,
		async (span) => {
			span.setAttributes({
				"http.request.method": request.method,
				"server.address": url.hostname,
			});
			const headers = new Headers(request.headers);
			const context = currentSpan() ?? span.context;
			if (!headers.has("traceparent")) headers.set("traceparent", formatTraceparent(context));

			const response = await fetch(new Request(request, { headers }));
			span.setAttributes({ "http.response.status_code": response.status });
			if (response.status >= 500) span.setError(`HTTP ${response.status}`);
			return response;
		},
		{ kind: "client" },
	);
}
