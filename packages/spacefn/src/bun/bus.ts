import { Clock, Duration, Effect, Layer, PubSub, Semaphore, Stream } from "effect";
import { Bus, BusError } from "spacefn";

import { SpaceState, throttled } from "./state.ts";

/** How often a process with subscribers reads what other processes published. */
const POLL = Duration.millis(250);
/** Published messages older than this are deleted; nobody is waiting for them. */
const KEEP_MILLIS = 60_000;

/**
 * Bus across processes. Subscribers in this process get a message at once;
 * every message is also written to the state database, which processes with
 * subscribers read four times a second. So a queue consumer or cron can
 * publish to the web process's live pages.
 */
export const busLayer: Layer.Layer<Bus, never, SpaceState> = Layer.effect(
	Bus,
	Effect.gen(function* () {
		const sql = yield* SpaceState;
		const origin = crypto.randomUUID();
		const topics = new Map<string, { pubsub: PubSub.PubSub<string>; subscribers: number }>();
		const lock = yield* Semaphore.make(1);
		const prune = throttled(30_000);
		let subscribers = 0;
		let cursor = 0;

		const deliver = (topic: string, message: string) => {
			const entry = topics.get(topic);
			return entry ? Effect.asVoid(PubSub.publish(entry.pubsub, message)) : Effect.void;
		};
		const latestId = sql<{ id: number | null }>`SELECT MAX(id) AS id FROM space_bus`.pipe(
			Effect.map((rows) => Number(rows[0]?.id ?? 0)),
		);
		const pruneOld = (now: number) =>
			prune(now, sql`DELETE FROM space_bus WHERE at < ${now - KEEP_MILLIS}`.pipe(Effect.asVoid));

		const poll = Effect.gen(function* () {
			if (subscribers === 0) return;
			const rows = yield* sql<{ id: number; topic: string; message: string; origin: string }>`
				SELECT id, topic, message, origin FROM space_bus WHERE id > ${cursor} ORDER BY id LIMIT 1000`;
			for (const row of rows) {
				cursor = Math.max(cursor, Number(row.id));
				if (row.origin !== origin) yield* deliver(row.topic, row.message);
			}
			yield* pruneOld(yield* Clock.currentTimeMillis);
		}).pipe(Effect.catchCause((cause) => Effect.logWarning("Bus: reading messages failed", cause)));
		yield* Effect.forkScoped(
			Effect.forever(Effect.andThen(lock.withPermit(poll), Effect.sleep(POLL))),
		);

		return {
			publish: (topic, message) =>
				Effect.gen(function* () {
					yield* deliver(topic, message);
					const now = yield* Clock.currentTimeMillis;
					yield* sql`
						INSERT INTO space_bus (topic, message, origin, at) VALUES (${topic}, ${message}, ${origin}, ${now})`;
					yield* pruneOld(now);
				}).pipe(Effect.mapError((cause) => new BusError({ operation: "publish", topic, cause }))),
			subscribe: (topic) =>
				Effect.gen(function* () {
					const entry = yield* lock.withPermit(
						Effect.gen(function* () {
							// Start reading from now: messages before the subscription aren't for it.
							if (subscribers === 0) cursor = yield* latestId;
							subscribers++;
							let entry = topics.get(topic);
							if (!entry) {
								entry = { pubsub: yield* PubSub.unbounded<string>(), subscribers: 0 };
								topics.set(topic, entry);
							}
							entry.subscribers++;
							return entry;
						}),
					);
					yield* Effect.addFinalizer(() =>
						Effect.sync(() => {
							subscribers--;
							if (--entry.subscribers === 0) topics.delete(topic);
						}),
					);
					return Stream.fromSubscription(yield* PubSub.subscribe(entry.pubsub));
				}).pipe(Effect.mapError((cause) => new BusError({ operation: "subscribe", topic, cause }))),
		};
	}),
);
