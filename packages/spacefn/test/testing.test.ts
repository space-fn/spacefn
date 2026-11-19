import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { defineEnv, Env, Kv, Queue } from "../src/index.ts";
import { memoryServices, QueueInbox, testEnv } from "../src/testing.ts";

const AppEnv = defineEnv({ FROM: Env.string() });

// What an app's module test looks like: business logic over services, no runtime.
const sendWelcome = (to: string) =>
	Effect.gen(function* () {
		const env = yield* AppEnv;
		const kv = yield* Kv;
		if (Option.isSome(yield* kv.get(`welcomed:${to}`))) return false;
		yield* (yield* Queue).send("emails", { from: env.FROM, to });
		yield* kv.set(`welcomed:${to}`, "1");
		return true;
	});

const TestLayer = Layer.mergeAll(
	memoryServices,
	AppEnv.layer.pipe(Layer.provide(testEnv({ FROM: "hi@app.dev" }))),
);

describe("spacefn/testing", () => {
	it.effect("runs module logic against in-memory services and test env", () =>
		Effect.gen(function* () {
			expect(yield* sendWelcome("a@example.com")).toBe(true);
			expect(yield* sendWelcome("a@example.com")).toBe(false);
			expect(yield* (yield* QueueInbox).take("emails")).toEqual([
				{ from: "hi@app.dev", to: "a@example.com" },
			]);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("gives each test fresh services", () =>
		Effect.gen(function* () {
			expect(yield* sendWelcome("a@example.com")).toBe(true);
		}).pipe(Effect.provide(TestLayer)),
	);
});
