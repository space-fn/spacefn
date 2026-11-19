import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { HttpServerResponse } from "effect/http";

import { middleware } from "../src/http/middleware.ts";
import { route } from "../src/http/route.ts";
import { defineEnv, Env, Kv, Queue } from "../src/index.ts";
import { memoryServices, QueueInbox, testEnv, testHttp } from "../src/testing.ts";

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

describe("testHttp", () => {
	it("serves routes and middleware with one shared set of services", async () => {
		const counter = route({
			POST: Effect.gen(function* () {
				const kv = yield* Kv;
				const n = Number(Option.getOrElse(yield* kv.get("n"), () => "0")) + 1;
				yield* kv.set("n", String(n));
				return { n };
			}),
		});
		const stamp = middleware((next) =>
			Effect.gen(function* () {
				const kv = yield* Kv;
				const response = yield* next;
				const n = Option.getOrElse(yield* kv.get("n"), () => "0");
				return HttpServerResponse.setHeader(response, "x-n", n);
			}),
		);
		const app = testHttp(
			{
				routes: [
					{
						kind: "route",
						path: "/count",
						params: [],
						file: "app/routes/count.ts",
						module: { default: counter },
					},
				],
				middleware: [{ file: "app/middleware/stamp.ts", module: { default: stamp } }],
			},
			memoryServices,
		);
		await app.fetch("/count", { method: "POST" });
		const second = await app.fetch("/count", { method: "POST" });
		expect(await second.json()).toEqual({ n: 2 });
		expect(second.headers.get("x-n")).toBe("2");
		await app.dispose();
	});
});
