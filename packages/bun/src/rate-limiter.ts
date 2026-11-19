import { Clock, Effect, Layer } from "effect";
import { RateLimiter, RateLimiterError } from "spacefn";

import { SpaceState, throttled } from "./state.ts";

/**
 * Fixed windows on the state database. One upsert counts the hit and returns
 * the window, so every process and replica agrees on the count.
 */
export const rateLimiterLayer: Layer.Layer<RateLimiter, never, SpaceState> = Layer.effect(
	RateLimiter,
	Effect.gen(function* () {
		const sql = yield* SpaceState;
		const sweep = throttled(60_000);
		return {
			hit: (key, windowMillis) =>
				Effect.gen(function* () {
					const now = yield* Clock.currentTimeMillis;
					const resetAt = now + windowMillis;
					// SET sees the old row, so both CASEs test the same window.
					const rows = yield* sql<{ count: number; reset_at: number }>`
						INSERT INTO space_rate (key, count, reset_at) VALUES (${key}, 1, ${resetAt})
						ON CONFLICT (key) DO UPDATE SET
							count = CASE WHEN reset_at <= ${now} THEN 1 ELSE count + 1 END,
							reset_at = CASE WHEN reset_at <= ${now} THEN ${resetAt} ELSE reset_at END
						RETURNING count, reset_at`;
					yield* sweep(
						now,
						sql`DELETE FROM space_rate WHERE reset_at <= ${now}`.pipe(Effect.asVoid),
					);
					const row = rows[0]!;
					return { count: Number(row.count), resetAt: Number(row.reset_at) };
				}).pipe(Effect.mapError((cause) => new RateLimiterError({ key, cause }))),
		};
	}),
);
