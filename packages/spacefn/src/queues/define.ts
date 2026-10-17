/** The part of the Workers `ExecutionContext` that queue consumers use. */
export interface QueueContext {
	waitUntil(promise: Promise<unknown>): void;
}

export interface QueueMessage<Body> {
	readonly id: string;
	readonly body: Body;
	readonly attempts: number;
	ack(): void;
	retry(options?: { delaySeconds?: number }): void;
}

export interface QueueBatch<Body> {
	readonly queue: string;
	readonly messages: readonly QueueMessage<Body>[];
	ackAll(): void;
	retryAll(options?: { delaySeconds?: number }): void;
}

export type QueueHandler<Body = unknown> = (
	batch: QueueBatch<Body>,
	env: unknown,
	ctx: QueueContext,
) => void | Promise<void>;

/**
 * Declares the consumer of the queue named after this file. The default export
 * of `queues/<name>.ts`.
 */
export function defineQueue<Body = unknown>(handler: QueueHandler<Body>): QueueHandler<Body> {
	return handler;
}
