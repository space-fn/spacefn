import { deserialize, serialize } from "node:v8";

import { Clock, Duration, Effect, Layer } from "effect";
import { Queue, QueueError, type ManifestQueue, type SpaceManifest } from "spacefn";
import {
	consumeBatch,
	queueConsumerOf,
	type Delivery,
	type Unchecked,
} from "spacefn/internal/runtime";

import { SpaceState } from "./state.ts";

/** Messages claimed at once, as on Cloudflare. */
const BATCH_SIZE = 10;
/**
 * A claimed message is delivered again if it isn't settled by then, i.e. its
 * process died. The lease is renewed while the handler runs, so a long one
 * keeps it.
 */
const LEASE_MILLIS = 60_000;
/** Retries before a message is dropped, as on Cloudflare without a dead-letter queue. */
export const MAX_RETRIES = 3;
/** How often an idle consumer looks for due messages. */
const IDLE_POLL = Duration.seconds(1);

/**
 * Queue on the state database: a message is a row, visible once its delay
 * passes. Bodies are stored structured-cloned, as Cloudflare Queues stores them.
 */
export const queueLayer = (
	queues: readonly Pick<ManifestQueue, "name">[],
): Layer.Layer<Queue, never, SpaceState> =>
	Layer.effect(
		Queue,
		Effect.gen(function* () {
			const sql = yield* SpaceState;
			const names = new Set(queues.map((queue) => queue.name));
			return {
				send: (queue, body, options) =>
					Effect.gen(function* () {
						if (!names.has(queue))
							return yield* new QueueError({
								queue,
								message: `No queue named "${queue}". Add app/queues/${queue}.ts.`,
							});
						const bytes = yield* Effect.try({
							try: () => serialize(body),
							catch: (cause) =>
								new QueueError({ queue, message: "The message body cannot be serialized", cause }),
						});
						const now = yield* Clock.currentTimeMillis;
						const delay =
							options?.delay === undefined
								? 0
								: Duration.toMillis(Duration.fromInputUnsafe(options.delay));
						yield* sql`
							INSERT INTO space_queue (id, queue, body, visible_at, sent_at)
							VALUES (${crypto.randomUUID()}, ${queue}, ${new Uint8Array(bytes)}, ${now + delay}, ${now})`.pipe(
							Effect.mapError(
								(cause) => new QueueError({ queue, message: "The message wasn't stored", cause }),
							),
						);
					}),
			};
		}),
	);

interface Claimed {
	readonly id: string;
	readonly body: ArrayBuffer | Uint8Array;
	readonly attempts: number;
	readonly sent_at: number;
}

/** The stored body; one that can't be read is undefined, so it fails decoding and is retried, then dropped. */
const bodyOf = (row: Claimed): unknown => {
	try {
		return deserialize(new Uint8Array(row.body));
	} catch {
		return undefined;
	}
};

/**
 * Claims due messages of `queue` and hands them to its consumer, forever.
 * Several processes can run this: a claim is one UPDATE, so each message goes
 * to one of them.
 */
export const consumeQueue = (entry: Unchecked<ManifestQueue>) =>
	Effect.gen(function* () {
		const sql = yield* SpaceState;
		const consumer = yield* queueConsumerOf(entry);
		const claim = Effect.gen(function* () {
			const now = yield* Clock.currentTimeMillis;
			const rows = yield* sql<Claimed>`
				UPDATE space_queue SET attempts = attempts + 1, visible_at = ${now + LEASE_MILLIS}
				WHERE id IN (
					SELECT id FROM space_queue WHERE queue = ${entry.name} AND visible_at <= ${now}
					ORDER BY visible_at LIMIT ${BATCH_SIZE}
				)
				RETURNING id, body, attempts, sent_at`;
			return [...rows].sort((a, b) => Number(a.sent_at) - Number(b.sent_at));
		});
		const delivery = (row: Claimed, unsettled: Set<string>): Delivery => {
			const attempts = Number(row.attempts);
			const settle = Effect.sync(() => void unsettled.delete(row.id));
			const drop = sql`DELETE FROM space_queue WHERE id = ${row.id}`.pipe(Effect.andThen(settle));
			return {
				id: row.id,
				body: bodyOf(row),
				attempts,
				ack: drop.pipe(Effect.orDie),
				retry: (delay) =>
					(attempts > MAX_RETRIES
						? Effect.logError(
								`Queue ${entry.name}: message ${row.id} dropped after ${attempts} attempts`,
							).pipe(Effect.andThen(drop))
						: Effect.gen(function* () {
								const now = yield* Clock.currentTimeMillis;
								const at = now + (delay === undefined ? 0 : Duration.toMillis(delay));
								yield* sql`UPDATE space_queue SET visible_at = ${at} WHERE id = ${row.id}`;
								yield* settle;
							})
					).pipe(Effect.orDie),
			};
		};
		// Only rows still leased: one retried meanwhile keeps its new time.
		const renew = (unsettled: ReadonlySet<string>) =>
			Effect.gen(function* () {
				const now = yield* Clock.currentTimeMillis;
				for (const id of unsettled)
					yield* sql`
						UPDATE space_queue SET visible_at = ${now + LEASE_MILLIS}
						WHERE id = ${id} AND visible_at > ${now}`;
			}).pipe(Effect.ignore, Effect.delay(LEASE_MILLIS / 3), Effect.forever);
		const release = (ids: readonly string[]) =>
			Effect.forEach(
				ids,
				(id) =>
					sql`UPDATE space_queue SET visible_at = 0, attempts = attempts - 1 WHERE id = ${id}`,
				{ discard: true },
			).pipe(Effect.ignore);
		return yield* Effect.forever(
			Effect.gen(function* () {
				const rows = yield* claim;
				if (rows.length === 0) return yield* Effect.sleep(IDLE_POLL);
				const unsettled = new Set(rows.map((row) => row.id));
				yield* Effect.forkScoped(renew(unsettled));
				yield* consumeBatch(
					entry.name,
					consumer,
					rows.map((row) => delivery(row, unsettled)),
				).pipe(
					// Stopping mid-batch hands the rest back now instead of when the lease ends.
					Effect.onInterrupt(() => release([...unsettled])),
				);
			}).pipe(
				Effect.scoped,
				// A database hiccup shouldn't end the consumer.
				Effect.catchCause((cause) =>
					Effect.logError(`Queue ${entry.name}: polling failed`, cause).pipe(
						Effect.andThen(Effect.sleep(IDLE_POLL)),
					),
				),
			),
		);
	});

/** Every queue consumer of the manifest, at once. */
export const consumeQueues = (manifest: Pick<SpaceManifest, "queues">) =>
	Effect.forEach(manifest.queues, consumeQueue, { concurrency: "unbounded", discard: true });
