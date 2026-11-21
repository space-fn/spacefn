import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";

import { route } from "../src/http/route.ts";
import { clientAddress, rateLimit, RateLimiter } from "../src/services/rate-limiter.ts";
import { testHttp } from "../src/testing.ts";

describe("rateLimit", () => {
	it.effect("allows the limit per window, then fails with a retry delay", () =>
		Effect.gen(function* () {
			const signIn = rateLimit("sign-in:ada", { limit: 2, window: "1 minute" });
			yield* signIn;
			yield* signIn;
			yield* TestClock.adjust("20 seconds");
			const error = yield* Effect.flip(signIn);
			expect(error).toMatchObject({ _tag: "TooManyRequests", retryAfterSeconds: 40 });
			yield* rateLimit("sign-in:bob", { limit: 2, window: "1 minute" });

			yield* TestClock.adjust("40 seconds");
			yield* signIn;
		}).pipe(Effect.provide(RateLimiter.memory)),
	);

	it("answers 429 with Retry-After from a route, keyed by the client address", async () => {
		const app = testHttp(
			{
				routes: [
					{
						path: "/sign-in",
						params: [],
						file: "app/routes/sign-in.ts",
						module: {
							default: route({
								POST: Effect.gen(function* () {
									yield* rateLimit(`sign-in:${yield* clientAddress}`, {
										limit: 1,
										window: "1 hour",
									});
									return "ok";
								}),
							}),
						},
					},
				],
			},
			RateLimiter.memory,
		);
		const from = (ip: string) =>
			app.fetch("/sign-in", { method: "POST", headers: { "cf-connecting-ip": ip } });
		expect((await from("1.1.1.1")).status).toBe(200);
		const limited = await from("1.1.1.1");
		expect([limited.status, limited.headers.get("retry-after")]).toEqual([429, "3600"]);
		expect((await from("2.2.2.2")).status).toBe(200);
		await app.dispose();
	});
});
