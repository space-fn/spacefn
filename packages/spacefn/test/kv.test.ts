import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { TestClock } from "effect/testing";

import { Kv } from "../src/services/kv.ts";

describe("Kv.memory", () => {
	it.effect("stores, reads and deletes values", () =>
		Effect.gen(function* () {
			const kv = yield* Kv;
			expect(yield* kv.get("a")).toEqual(Option.none());
			yield* kv.set("a", "1");
			expect(yield* kv.get("a")).toEqual(Option.some("1"));
			yield* kv.delete("a");
			expect(yield* kv.get("a")).toEqual(Option.none());
		}).pipe(Effect.provide(Kv.memory)),
	);

	it.effect("expires values after their ttl", () =>
		Effect.gen(function* () {
			const kv = yield* Kv;
			yield* kv.set("session", "s1", { ttl: "1 minute" });
			yield* TestClock.adjust("59 seconds");
			expect(yield* kv.get("session")).toEqual(Option.some("s1"));
			yield* TestClock.adjust("1 second");
			expect(yield* kv.get("session")).toEqual(Option.none());
		}).pipe(Effect.provide(Kv.memory)),
	);

	it.effect("a new set replaces the value and its ttl", () =>
		Effect.gen(function* () {
			const kv = yield* Kv;
			yield* kv.set("k", "old", { ttl: "1 second" });
			yield* kv.set("k", "new");
			yield* TestClock.adjust("1 hour");
			expect(yield* kv.get("k")).toEqual(Option.some("new"));
		}).pipe(Effect.provide(Kv.memory)),
	);

	it.effect("each layer build starts empty", () =>
		Effect.gen(function* () {
			yield* Effect.gen(function* () {
				yield* (yield* Kv).set("a", "1");
			}).pipe(Effect.provide(Kv.memory));
			const value = yield* Effect.gen(function* () {
				return yield* (yield* Kv).get("a");
			}).pipe(Effect.provide(Kv.memory));
			expect(value).toEqual(Option.none());
		}),
	);
});
