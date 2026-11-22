import { describe, expect, it } from "@effect/vitest";
import { Clock, Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { cron } from "spacefn";

import { runCrons } from "../../src/bun/cron.ts";

describe("runCrons", () => {
	it.effect("runs each job at the start of the minutes its schedule matches, failing or not", () =>
		Effect.gen(function* () {
			const ran: string[] = [];
			const job = (name: string, schedule: string, fails = false) => ({
				name,
				file: `app/crons/${name}.ts`,
				module: {
					default: cron(
						schedule,
						Effect.gen(function* () {
							ran.push(`${name}@${(yield* Clock.currentTimeMillis) / 60_000}`);
							if (fails) return yield* Effect.fail("boom");
						}),
					),
				},
			});
			const fiber = yield* Effect.forkChild(
				runCrons({ crons: [job("often", "*/2 * * * *"), job("broken", "1 * * * *", true)] }),
			);
			yield* TestClock.adjust("5 minutes");
			yield* Fiber.interrupt(fiber);
			expect(ran).toEqual(["broken@1", "often@2", "often@4"]);
		}),
	);
});
