import type { Context, MiddlewareHandler } from "hono";

export interface RateHit {
	/** Requests counted in the current window, including this one. */
	count: number;
	/** Epoch milliseconds when the window ends. */
	resetAt: number;
}

/**
 * Counts requests per key in fixed windows. The count must be consistent across
 * every request, so the store must be a single source of truth such as a Durable
 * Object. KV is eventually consistent and is not suitable.
 */
export interface RateStore {
	hit(key: string, windowMs: number, now: number): Promise<RateHit>;
}

/** An in-memory store. Correct within one isolate only: for development and tests. */
export function memoryRateStore(): RateStore {
	const windows = new Map<string, RateHit>();
	return {
		async hit(key, windowMs, now) {
			const current = windows.get(key);
			const next =
				current && now < current.resetAt
					? { count: current.count + 1, resetAt: current.resetAt }
					: { count: 1, resetAt: now + windowMs };
			windows.set(key, next);
			return next;
		},
	};
}

export interface RateLimitOptions {
	store: RateStore;
	/** Requests allowed per window. */
	limit: number;
	windowMs: number;
	/** Who is counted. Defaults to the client IP from `cf-connecting-ip`. */
	key?: (c: Context) => string;
}

/** The client address Cloudflare reports, or `unknown` when it is missing. */
export function clientKey(c: Context): string {
	return c.req.header("cf-connecting-ip") ?? "unknown";
}

/** Answers 429 with `Retry-After` once a key passes its limit within the window. */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
	return async (c, next) => {
		const now = Date.now();
		const hit = await options.store.hit(options.key?.(c) ?? clientKey(c), options.windowMs, now);
		if (hit.count > options.limit) {
			const retryAfter = Math.max(1, Math.ceil((hit.resetAt - now) / 1000));
			c.header("Retry-After", String(retryAfter));
			return c.json({ error: "rate_limited", message: "Too many requests" }, 429);
		}
		await next();
	};
}
