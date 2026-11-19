import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { Queue, QueueInbox } from "../src/services/queue.ts";

describe("Queue.memory", () => {
	it.effect("records sent messages with their queue and delay", () =>
		Effect.gen(function* () {
			const queue = yield* Queue;
			yield* queue.send("emails", { to: "a@example.com" });
			yield* queue.send("thumbnails", { id: 7 }, { delay: "30 seconds" });
			expect(yield* (yield* QueueInbox).messages).toEqual([
				{ queue: "emails", body: { to: "a@example.com" }, delay: undefined },
				{ queue: "thumbnails", body: { id: 7 }, delay: "30 seconds" },
			]);
		}).pipe(Effect.provide(Queue.memory)),
	);

	it.effect("take drains one queue and leaves the others", () =>
		Effect.gen(function* () {
			const queue = yield* Queue;
			const inbox = yield* QueueInbox;
			yield* queue.send("emails", 1);
			yield* queue.send("other", 2);
			yield* queue.send("emails", 3);
			expect(yield* inbox.take("emails")).toEqual([1, 3]);
			expect(yield* inbox.take("emails")).toEqual([]);
			expect((yield* inbox.messages).map((m) => m.queue)).toEqual(["other"]);
		}).pipe(Effect.provide(Queue.memory)),
	);

	it.effect("stores a copy, so later changes by the sender don't leak in", () =>
		Effect.gen(function* () {
			const body = { n: 1 };
			yield* (yield* Queue).send("q", body);
			body.n = 2;
			expect(yield* (yield* QueueInbox).take("q")).toEqual([{ n: 1 }]);
		}).pipe(Effect.provide(Queue.memory)),
	);

	it.effect("refuses a body that can't be serialized, as Workers Queues would", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip((yield* Queue).send("q", { run: () => 1 }));
			expect(error).toMatchObject({ _tag: "QueueError", queue: "q" });
		}).pipe(Effect.provide(Queue.memory)),
	);
});
