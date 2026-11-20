import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { TestClock } from "effect/testing";
import { Kv, RateLimiter } from "spacefn";

import { kvLayer } from "../../src/bun/kv.ts";
import { rateLimiterLayer } from "../../src/bun/rate-limiter.ts";
import { stateAt } from "./helpers.ts";

describe("state database", () => {
	it.effect("Kv expires keys", () =>
		Effect.gen(function* () {
			const kv = yield* Kv;
			yield* kv.set("a", "1", { ttl: "1 minute" });
			yield* kv.set("b", "2");
			expect(yield* kv.get("a")).toEqual(Option.some("1"));
			yield* TestClock.adjust("2 minutes");
			expect(yield* kv.get("a")).toEqual(Option.none());
			expect(yield* kv.get("b")).toEqual(Option.some("2"));
			yield* kv.delete("b");
			expect(yield* kv.get("b")).toEqual(Option.none());
		}).pipe(Effect.provide(kvLayer.pipe(Layer.provide(stateAt("kv.db"))))),
	);

	it.effect("RateLimiter counts in fixed windows", () =>
		Effect.gen(function* () {
			const limiter = yield* RateLimiter;
			expect((yield* limiter.hit("k", 60_000)).count).toBe(1);
			const second = yield* limiter.hit("k", 60_000);
			expect(second).toEqual({ count: 2, resetAt: 60_000 });
			yield* TestClock.adjust("61 seconds");
			expect(yield* limiter.hit("k", 60_000)).toEqual({ count: 1, resetAt: 121_000 });
		}).pipe(Effect.provide(rateLimiterLayer.pipe(Layer.provide(stateAt("rate.db"))))),
	);
});
