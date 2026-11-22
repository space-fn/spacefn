import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Stream } from "effect";

import { Bus } from "../src/services/bus.ts";

describe("Bus.memory", () => {
	it.effect("delivers messages published after subscribing, in order", () =>
		Effect.gen(function* () {
			const bus = yield* Bus;
			const stream = yield* bus.subscribe("todos");
			// Published before anyone reads the stream, but after subscribing: still delivered.
			yield* bus.publish("todos", "a");
			yield* bus.publish("todos", "b");
			const received = yield* Stream.runCollect(Stream.take(stream, 2));
			expect(received).toEqual(["a", "b"]);
		}).pipe(Effect.scoped, Effect.provide(Bus.memory)),
	);

	it.effect("fans out to every subscriber of a topic and keeps topics apart", () =>
		Effect.gen(function* () {
			const bus = yield* Bus;
			const first = yield* bus.subscribe("room:1");
			const second = yield* bus.subscribe("room:1");
			const other = yield* bus.subscribe("room:2");
			const otherFiber = yield* Effect.forkScoped(Stream.runCollect(Stream.take(other, 1)));
			yield* bus.publish("room:1", "hello");
			yield* bus.publish("room:2", "only-2");
			expect(yield* Stream.runCollect(Stream.take(first, 1))).toEqual(["hello"]);
			expect(yield* Stream.runCollect(Stream.take(second, 1))).toEqual(["hello"]);
			expect(yield* Fiber.join(otherFiber)).toEqual(["only-2"]);
		}).pipe(Effect.scoped, Effect.provide(Bus.memory)),
	);

	it.effect("publishing with no subscribers is a no-op", () =>
		Effect.gen(function* () {
			const bus = yield* Bus;
			yield* bus.publish("nobody", "x");
			const stream = yield* bus.subscribe("nobody");
			yield* bus.publish("nobody", "y");
			expect(yield* Stream.runCollect(Stream.take(stream, 1))).toEqual(["y"]);
		}).pipe(Effect.scoped, Effect.provide(Bus.memory)),
	);
});
