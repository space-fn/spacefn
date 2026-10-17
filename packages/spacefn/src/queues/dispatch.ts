import { traceBindings } from "../trace/bindings";
import { getTracer, withSpan } from "../trace/span";
import type { QueueBatch, QueueContext, QueueHandler } from "./define";

/**
 * Routes a batch to the consumer registered for its queue. Each batch runs in
 * a `queue.process` span. An unknown queue fails the batch so nothing is lost.
 */
export async function dispatchQueue(
	batch: QueueBatch<unknown>,
	env: object,
	ctx: QueueContext,
	handlers: Record<string, QueueHandler<never>>,
): Promise<void> {
	// Each consumer only ever receives batches of its own queue, so its body type is trusted here.
	const handler = handlers[batch.queue] as QueueHandler<unknown> | undefined;
	if (!handler) {
		batch.retryAll();
		throw new Error(`No consumer is registered for queue "${batch.queue}"`);
	}

	await withSpan(
		"queue.process",
		async (span) => {
			span.setAttributes({
				"messaging.system": "cloudflare_queues",
				"messaging.destination.name": batch.queue,
				"messaging.batch.message_count": batch.messages.length,
			});
			await handler(batch, traceBindings(env), ctx);
		},
		{ kind: "consumer" },
	);

	const flush = getTracer()?.flush;
	if (flush) ctx.waitUntil(flush.call(getTracer()));
}
