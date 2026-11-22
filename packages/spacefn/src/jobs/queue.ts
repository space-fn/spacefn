import { Duration, Effect, Predicate, Schema } from "effect";

import { SpaceError } from "../errors.ts";
import type { ManifestQueue, Unchecked } from "../manifest.ts";

/** One message as the consumer's handler sees it. */
export interface QueueMessage<A> {
	readonly id: string;
	readonly body: A;
	/** 1 on the first delivery. */
	readonly attempts: number;
}

export interface QueueConsumerDefinition<A, I, RD, E, R> {
	/** Decodes each body. A body that doesn't decode is retried like a failed one. */
	readonly body: Schema.Codec<A, I, RD>;
	readonly handler: (body: A, message: QueueMessage<A>) => Effect.Effect<void, E, R>;
	/** Messages of a batch handled at once. Default 1, in order. */
	readonly concurrency?: number;
	/** Wait before a failed message is delivered again. Default: the queue's setting. */
	readonly retryDelay?: Duration.Input;
}

const QueueConsumerTypeId = "~spacefn/QueueConsumer";

export interface QueueConsumer<A = any, E = any, R = any> {
	readonly [QueueConsumerTypeId]: typeof QueueConsumerTypeId;
	readonly definition: QueueConsumerDefinition<A, any, any, E, R>;
}

/**
 * Declares the consumer of a file in `app/queues/`; the queue is named after
 * the file. Each message is acked once its handler succeeds and retried when
 * it fails, so one bad message doesn't redeliver the whole batch.
 *
 * ```ts
 * export default queue({
 *   body: Schema.Struct({ to: Schema.String }),
 *   handler: ({ to }) => Mailer.send(to, "Welcome"),
 * });
 * ```
 */
export const queue = <A, I, RD, E, R>(
	definition: QueueConsumerDefinition<A, I, RD, E, R>,
): QueueConsumer<A, E, R | RD> => ({
	[QueueConsumerTypeId]: QueueConsumerTypeId,
	definition,
});

export const isQueueConsumer = (value: unknown): value is QueueConsumer =>
	Predicate.hasProperty(value, QueueConsumerTypeId);

/** A delivered message as the target hands it over: the raw body, plus how to settle it. */
export interface Delivery {
	readonly id: string;
	readonly body: unknown;
	readonly attempts: number;
	readonly ack: Effect.Effect<void>;
	readonly retry: (delay: Duration.Duration | undefined) => Effect.Effect<void>;
}

/** The consumer of a manifest entry, or a SpaceError when the file exports something else. */
export const queueConsumerOf = (
	entry: Unchecked<ManifestQueue>,
): Effect.Effect<QueueConsumer, SpaceError> => {
	const value = (entry.module as { default?: unknown }).default;
	return isQueueConsumer(value)
		? Effect.succeed(value)
		: Effect.fail(
				new SpaceError({
					code: "QUEUE_EXPORT",
					message: "The default export is not a queue consumer",
					hint: "Export the consumer with: export default queue({ body, handler })",
					file: entry.file,
				}),
			);
};

/**
 * Handles one batch: decode, run the handler, then ack or retry each message.
 * Failures are logged with the message id and never fail the batch.
 */
export const consumeBatch = (
	name: string,
	consumer: QueueConsumer,
	deliveries: ReadonlyArray<Delivery>,
): Effect.Effect<void, never, any> => {
	const { body, handler, concurrency = 1, retryDelay } = consumer.definition;
	const delay = retryDelay === undefined ? undefined : Duration.fromInputUnsafe(retryDelay);
	const decode = Schema.decodeUnknownEffect(body);
	const one = (delivery: Delivery) =>
		decode(delivery.body).pipe(
			Effect.flatMap((decoded) =>
				handler(decoded, { id: delivery.id, body: decoded, attempts: delivery.attempts }),
			),
			Effect.matchCauseEffect({
				onSuccess: () => delivery.ack,
				onFailure: (cause) =>
					Effect.logError(`Queue ${name}: message ${delivery.id} failed, retrying`, cause).pipe(
						Effect.andThen(delivery.retry(delay)),
					),
			}),
			Effect.withSpan("queue.message", {
				attributes: {
					"messaging.message.id": delivery.id,
					"messaging.attempts": delivery.attempts,
				},
			}),
		);
	return Effect.forEach(deliveries, one, { concurrency, discard: true }).pipe(
		Effect.withSpan("queue.process", {
			kind: "consumer",
			attributes: {
				"messaging.destination.name": name,
				"messaging.batch.message_count": deliveries.length,
			},
		}),
	);
};

/** Thrown into the target when a batch arrives for a queue with no consumer, so it is redelivered. */
export const noConsumer = (name: string): SpaceError =>
	new SpaceError({
		code: "QUEUE_NO_CONSUMER",
		message: `No consumer for queue "${name}"`,
		hint: `Add app/queues/${name}.ts.`,
	});
