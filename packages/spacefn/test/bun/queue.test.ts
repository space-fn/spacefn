import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Layer, Schema } from "effect";
import { Queue, queue } from "spacefn";

import { consumeQueue, MAX_RETRIES, queueLayer } from "../../src/bun/queue.ts";
import { captureLogs } from "../logs.ts";
import { build, stateAt } from "./helpers.ts";

const logged = captureLogs(
	/ERROR .*Queue emails: message \S+ (failed, retrying[^]*smtp down|dropped after)/,
);

describe("queue", () => {
	it.live("Queue delivers, retries, then drops a message", () =>
		Effect.gen(function* () {
			const seen: string[] = [];
			const consumer = queue({
				body: Schema.Struct({ to: Schema.String }),
				handler: ({ to }, message) =>
					Effect.sync(() => void seen.push(`${to}#${message.attempts}`)).pipe(
						Effect.andThen(to === "bad" ? Effect.fail("smtp down") : Effect.void),
					),
			});
			const entry = {
				name: "emails",
				binding: "QUEUE_EMAILS",
				file: "app/queues/emails.ts",
				module: { default: consumer },
			};
			const state = stateAt("queue.db");
			const q = yield* build(Queue, queueLayer([entry]).pipe(Layer.provide(state)));
			yield* q.send("emails", { to: "ada" });
			yield* q.send("emails", { to: "bad" });
			expect(yield* Effect.flip(q.send("nope", {}))).toMatchObject({ _tag: "QueueError" });
			expect((yield* Effect.flip(q.send("emails", { f: () => {} }))).message).toContain(
				"serialized",
			);
			const fiber = yield* Effect.forkChild(Effect.provide(consumeQueue(entry), state));
			yield* Effect.sleep("4500 millis");
			yield* Fiber.interrupt(fiber);
			expect(seen).toEqual([
				"ada#1",
				...Array.from({ length: MAX_RETRIES + 1 }, (_, i) => `bad#${i + 1}`),
			]);
			expect(logged.filter((line) => line.includes("failed, retrying"))).toHaveLength(
				MAX_RETRIES + 1,
			);
			expect(logged.at(-1)).toContain(`dropped after ${MAX_RETRIES + 1} attempts`);
		}).pipe(Effect.scoped),
	);
});
