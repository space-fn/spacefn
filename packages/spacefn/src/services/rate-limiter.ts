import { Clock, Context, Duration, Effect, Layer, Option, Schema } from "effect";
import { HttpServerRequest } from "effect/http";

import { TooManyRequests } from "../errors.ts";

export class RateLimiterError extends Schema.TaggedError<RateLimiterError>()("RateLimiterError", {
	key: Schema.String,
	cause: Schema.optional(Schema.Defect()),
}) {}

export interface RateHit {
	/** Hits in the current window, this one included. */
	readonly count: number;
	/** Epoch ms when the window ends. */
	readonly resetAt: number;
}

export interface RateLimiterShape {
	/** Counts one hit for `key` in a fixed window of `windowMillis`. */
	readonly hit: (key: string, windowMillis: number) => Effect.Effect<RateHit, RateLimiterError>;
}

/**
 * Fixed-window counters. Counts must agree across every request, so it needs
 * one source of truth: a Durable Object on Cloudflare (KV is eventually
 * consistent, so it can't be used), process memory on Bun and in tests.
 */
export class RateLimiter extends Context.Service<RateLimiter, RateLimiterShape>()(
	"spacefn/RateLimiter",
) {
	/** In-process counters on the Effect Clock. Ended windows are swept at most once a minute. */
	static readonly memory: Layer.Layer<RateLimiter> = Layer.sync(RateLimiter, () => {
		const windows = new Map<string, RateHit>();
		let lastSweep = Number.NEGATIVE_INFINITY;
		return {
			hit: (key, windowMillis) =>
				Effect.map(Clock.currentTimeMillis, (now) => {
					if (now - lastSweep >= 60_000) {
						for (const [name, window] of windows) if (now >= window.resetAt) windows.delete(name);
						lastSweep = now;
					}
					const current = windows.get(key);
					const next =
						current && now < current.resetAt
							? { count: current.count + 1, resetAt: current.resetAt }
							: { count: 1, resetAt: now + windowMillis };
					windows.set(key, next);
					return next;
				}),
		};
	});
}

export interface RateLimitOptions {
	/** Hits allowed per window. */
	readonly limit: number;
	readonly window: Duration.Input;
}

/**
 * Counts a hit for `key` and fails with `TooManyRequests` (429 with
 * `Retry-After`) once it passes `limit` in the window. Key it by what you are
 * protecting, e.g. `sign-in:${email}` and `sign-in:${yield* clientAddress}`.
 */
export const rateLimit = (
	key: string,
	options: RateLimitOptions,
): Effect.Effect<void, TooManyRequests | RateLimiterError, RateLimiter> =>
	Effect.gen(function* () {
		const limiter = yield* RateLimiter;
		const windowMillis = Duration.toMillis(Duration.fromInputUnsafe(options.window));
		const hit = yield* limiter.hit(key, windowMillis);
		if (hit.count <= options.limit) return;
		const now = yield* Clock.currentTimeMillis;
		return yield* new TooManyRequests({
			retryAfterSeconds: Math.max(1, Math.ceil((hit.resetAt - now) / 1000)),
		});
	});

/**
 * The client's address: Cloudflare's `cf-connecting-ip`, else the server's
 * remote address. Only trust it behind a proxy that sets or strips the header.
 */
export const clientAddress: Effect.Effect<string, never, HttpServerRequest.HttpServerRequest> =
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		return (
			request.headers["cf-connecting-ip"] ??
			Option.getOrElse(request.remoteAddress, () => "unknown")
		);
	});
