import { Effect, Layer } from "effect";
import { RateLimiter, RateLimiterError, type RateHit } from "spacefn";

import { binding, type WorkerEnv } from "./bindings.ts";

/** The Durable Object namespace `RateLimiter` uses; the entry exports {@link SpaceRateLimiter} for it. */
export const RATE_LIMITER_BINDING = "SPACE_RATE_LIMITER";

const WINDOW = "window";

/**
 * The counter for one key. It lives in the object's storage, so it survives
 * the object being evicted, and an alarm deletes it when its window ends.
 */
export class SpaceRateLimiter {
	readonly #ctx: DurableObjectState;

	constructor(ctx: DurableObjectState, _env: unknown) {
		this.#ctx = ctx;
	}

	async fetch(request: Request): Promise<Response> {
		const { windowMillis } = (await request.json()) as { windowMillis: number };
		const now = Date.now();
		const storage = this.#ctx.storage;
		// Storage calls don't let other requests in between, so read-then-write is atomic.
		const current = await storage.get<RateHit>(WINDOW);
		const next =
			current && now < current.resetAt
				? { count: current.count + 1, resetAt: current.resetAt }
				: { count: 1, resetAt: now + windowMillis };
		await storage.put(WINDOW, next);
		if (next.count === 1) await storage.setAlarm(next.resetAt);
		return Response.json(next);
	}

	async alarm(): Promise<void> {
		await this.#ctx.storage.deleteAll();
	}
}

/** `RateLimiter` on {@link SpaceRateLimiter}: one object per key, so every location sees the same count. */
export const rateLimiterLayer = (env: WorkerEnv): Layer.Layer<RateLimiter> =>
	Layer.succeed(RateLimiter, {
		hit: (key, windowMillis) =>
			Effect.tryPromise({
				try: async () => {
					const namespace = binding<DurableObjectNamespace>(
						env,
						RATE_LIMITER_BINDING,
						"Durable Object",
					);
					const response = await namespace
						.get(namespace.idFromName(key))
						.fetch("https://rate-limiter/hit", {
							method: "POST",
							body: JSON.stringify({ windowMillis }),
						});
					if (!response.ok) throw new Error(`The rate limiter answered ${response.status}`);
					return (await response.json()) as RateHit;
				},
				catch: (cause) => new RateLimiterError({ key, cause }),
			}),
	});
