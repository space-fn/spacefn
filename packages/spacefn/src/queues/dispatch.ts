import { runWithBindings } from "../env/current";
import { SpaceError } from "../errors";
import { traceBindings } from "../trace/bindings";
import { unwrapQueueBody } from "../trace/envelope";
import { getTracer, withSpan, type SpanContext } from "../trace/span";
import type { QueueBatch, QueueContext, QueueHandler, QueueMessage } from "./define";

/** Gives the consumer unwrapped bodies. Acks and retries still go to the platform message. */
function unwrapBatch(batch: QueueBatch<unknown>): {
	batch: QueueBatch<unknown>;
	parent?: SpanContext;
} {
	let parent: SpanContext | undefined;
	const messages = batch.messages.map((message): QueueMessage<unknown> => {
		const { body, context } = unwrapQueueBody(message.body);
		parent ??= context;
		return {
			id: message.id,
			attempts: message.attempts,
			body,
			ack: () => message.ack(),
			retry: (options) => message.retry(options),
		};
	});
	return {
		batch: {
			queue: batch.queue,
			messages,
			ackAll: () => batch.ackAll(),
			retryAll: (options) => batch.retryAll(options),
		},
		parent,
	};
}

/**
 * Routes a batch to the consumer registered for its queue. The batch runs in a
 * `queue.process` span, continuing the trace of its first message that carries
 * one. An unknown queue fails the batch so nothing is lost.
 */
export async function dispatchQueue(
	batch: QueueBatch<unknown>,
	env: object,
	ctx: QueueContext,
	handlers: Record<string, QueueHandler<never>>,
): Promise<void> {
	const handler = handlers[batch.queue] as QueueHandler<unknown> | undefined;
	if (!handler) {
		batch.retryAll();
		throw new SpaceError(
			"QUEUE_NO_CONSUMER",
			`No consumer is registered for queue "${batch.queue}"`,
			{ hint: "Add app/queues/<name>.ts." },
		);
	}

	const bindings = traceBindings(env);
	const unwrapped = unwrapBatch(batch);
	try {
		await runWithBindings(bindings, () =>
			withSpan(
				"queue.process",
				async (span) => {
					span.setAttributes({
						"messaging.system": "cloudflare_queues",
						"messaging.destination.name": batch.queue,
						"messaging.batch.message_count": batch.messages.length,
					});
					await handler(unwrapped.batch, bindings, ctx);
				},
				{ kind: "consumer", parent: unwrapped.parent },
			),
		);
	} finally {
		// Flush even when the consumer fails, so the error span is still exported.
		const tracer = getTracer();
		const flush = tracer?.flush?.bind(tracer);
		if (flush) ctx.waitUntil(flush());
	}
}
