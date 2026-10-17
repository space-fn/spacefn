import { wrapQueueBody } from "./envelope";
import { withSpan } from "./span";

export interface QueueLike {
	send(body: unknown, options?: unknown): Promise<void>;
	sendBatch(messages: Iterable<{ body: unknown }>, options?: unknown): Promise<void>;
}

/** Duck-types a Queue producer binding. */
export function isQueue(value: unknown): value is QueueLike {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as QueueLike).send === "function" &&
		typeof (value as QueueLike).sendBatch === "function"
	);
}

/**
 * Wraps a Queue producer so publishing becomes a `queue.publish` span. Each body
 * is wrapped in an envelope carrying that span, so the consumer continues the trace.
 * Message bodies are never recorded in the span.
 */
export function traceQueue(queue: QueueLike): QueueLike {
	return {
		send: (body, options) =>
			withSpan(
				"queue.publish",
				async (span) => queue.send(wrapQueueBody(body, span.context), options),
				{ attributes: { "messaging.operation.name": "send", "messaging.batch.message_count": 1 } },
			),
		sendBatch: async (messages, options) => {
			const list = [...messages];
			return withSpan(
				"queue.publish",
				async (span) =>
					queue.sendBatch(
						list.map((message) => ({
							...message,
							body: wrapQueueBody(message.body, span.context),
						})),
						options,
					),
				{
					attributes: {
						"messaging.operation.name": "send_batch",
						"messaging.batch.message_count": list.length,
					},
				},
			);
		},
	};
}
