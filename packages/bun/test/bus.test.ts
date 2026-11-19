import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Layer, Stream } from "effect";
import { Bus } from "spacefn";

import { busLayer } from "../src/bus.ts";
import { build, stateAt } from "./helpers.ts";

describe("bus", () => {
	it.live("Bus delivers across processes sharing the state database", () =>
		Effect.gen(function* () {
			const web = yield* build(Bus, busLayer.pipe(Layer.provide(stateAt("bus.db"))));
			const jobs = yield* build(Bus, busLayer.pipe(Layer.provide(stateAt("bus.db"))));
			yield* jobs.publish("todos", "before");
			const stream = yield* web.subscribe("todos");
			const received = yield* Effect.forkChild(Stream.runCollect(Stream.take(stream, 2)));
			yield* jobs.publish("todos", "changed");
			yield* web.publish("todos", "local");
			expect([...(yield* Fiber.join(received))].sort()).toEqual(["changed", "local"]);
		}).pipe(Effect.scoped),
	);
});
