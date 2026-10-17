import { withSpan } from "./span";

export interface QueueLike {
	send(body: unknown, options?: unknown): Promise<void>;
	sendBatch(messages: Iterable<unknown>, options?: unknown): Promise<void>;
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
 * Wraps a Queue producer so publishing becomes a `queue.publish` span. Message
 * bodies are not recorded.
 */
export function traceQueue(queue: QueueLike): QueueLike {
	return {
		send: (body, options) =>
			withSpan("queue.publish", async () => queue.send(body, options), {
				attributes: { "messaging.operation.name": "send", "messaging.batch.message_count": 1 },
			}),
		sendBatch: async (messages, options) => {
			const list = [...messages];
			return withSpan("queue.publish", async () => queue.sendBatch(list, options), {
				attributes: {
					"messaging.operation.name": "send_batch",
					"messaging.batch.message_count": list.length,
				},
			});
		},
	};
}
