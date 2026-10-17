import type { Context, MiddlewareHandler } from "hono";

import { runWithTrail } from "./scope.js";
import { formatTraceparent, parseTraceparent } from "./traceparent.js";
import { Trail } from "./trail.js";
import { httpTransport } from "./transport.js";
import type { Transport } from "./types.js";

export const TRAIL_CONTEXT_KEY = "spacefn.trail";

export interface TrailMiddlewareOptions {
	transport?: Transport;
	/** Convenience for `httpTransport({ endpoint, key })`. */
	endpoint?: string;
	key?: string;
	sampleRate?: number;
	maxRecords?: number;
	rootName?: string;
	/** Emit a `Server-Timing` header carrying the trace id. Default: true. */
	serverTiming?: boolean;
	/** Receives the flush promise. Defaults to `executionCtx.waitUntil`. */
	scheduleFlush?: (task: Promise<void>) => void;
	onError?: (error: unknown) => void;
	now?: () => number;
}

/** The trail of the current request, if tracing is active. */
export function trailFrom(c: Context): Trail | undefined {
	return c.get(TRAIL_CONTEXT_KEY) as Trail | undefined;
}

/**
 * Root span per request. Continues incoming `traceparent` context, stamps
 * `x-trace-id`/`traceparent`/`Server-Timing` on the response, captures thrown
 * errors and 5xx responses, and flushes in the background after the response
 * (including streamed/SSE bodies) has finished.
 */
export function trailMiddleware(options: TrailMiddlewareOptions = {}): MiddlewareHandler {
	const transport =
		options.transport ??
		(options.endpoint
			? httpTransport({ endpoint: options.endpoint, key: options.key })
			: undefined);
	return async (c, next) => {
		// No sink configured: tracing is inert. Telemetry must never break apps.
		if (!transport) {
			await next();
			return;
		}
		const incoming = parseTraceparent(c.req.header("traceparent"));
		const trail = new Trail({
			traceId: incoming?.traceId,
			parentSpanId: incoming?.spanId,
			sampled: incoming?.sampled,
			sampleRate: options.sampleRate,
			maxRecords: options.maxRecords,
			transport,
			rootName: options.rootName ?? "http.server.request",
			rootKind: "http.server",
			onError: options.onError,
			now: options.now,
		});
		const root = trail.root;
		root.set("http.method", c.req.method);
		root.set("http.path", c.req.path);
		c.set(TRAIL_CONTEXT_KEY, trail);
		const schedule =
			options.scheduleFlush ??
			((task: Promise<void>) => {
				try {
					c.executionCtx.waitUntil(task);
				} catch {
					void task;
				}
			});
		let finished = false;
		const finalize = () => {
			if (finished) return;
			finished = true;
			schedule(trail.flush());
		};
		try {
			await runWithTrail(trail, () => next());
		} catch (error) {
			root.set("http.status", 500);
			root.setError(error);
			trail.error(error);
			finalize();
			throw error;
		}
		trail.route = c.req.routePath ?? c.req.path;
		const res = c.res;
		root.set("http.status", res.status);
		// Stamp on the final response: `c.header()` values are lost when a
		// handler returns a raw `Response` instead of `c.text()`/`c.json()`.
		try {
			res.headers.set("x-trace-id", trail.traceId);
			res.headers.set(
				"traceparent",
				formatTraceparent({ traceId: trail.traceId, spanId: root.spanId, sampled: true }),
			);
			if (options.serverTiming !== false) {
				res.headers.set("Server-Timing", `trail;desc="${trail.traceId}"`);
			}
		} catch {
			// Immutable headers (e.g. null-body responses): skip stamping.
		}
		if (res.status >= 500) {
			// Hono's compose() converts thrown handler errors into the error
			// response before this middleware resumes; `c.error` keeps the
			// original error for the trace.
			const failure = c.error ?? new Error(`HTTP ${res.status}`);
			root.setError(failure);
			trail.error(failure, { attributes: { http_status: res.status } });
		}
		// Streamed bodies (SSE included) finish after `next()` resolves. The
		// root span ends with the stream, not with the response headers.
		const body = res.body;
		if (!body) {
			finalize();
			return res;
		}
		const wrapped = new Response(wrapStream(body, finalize), {
			status: res.status,
			statusText: res.statusText,
			headers: res.headers,
		});
		// Assign through the setter so the wrapped stream becomes the request's
		// response even though compose() already finalized the context.
		c.res = wrapped;
		return c.res;
	};
}

function wrapStream(
	body: ReadableStream<Uint8Array>,
	onEnd: () => void,
): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		async start(controller) {
			const reader = body.getReader();
			try {
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					controller.enqueue(value);
				}
				controller.close();
			} catch (error) {
				controller.error(error);
			} finally {
				onEnd();
			}
		},
		cancel(reason) {
			onEnd();
			return body.cancel(reason);
		},
	});
}
