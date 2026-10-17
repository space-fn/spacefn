import { currentBindings } from "../env/current";
import type { QueueHandler } from "./define";

/** The body type a consumer declares, read back from its default export. */
export type QueueBodyOf<H> = H extends QueueHandler<infer Body> ? Body : never;

export interface QueueProducer<Body> {
	send(body: Body, options?: { delaySeconds?: number }): Promise<void>;
	sendBatch(messages: Body[], options?: { delaySeconds?: number }): Promise<void>;
}

/** The Cloudflare producer binding the typed producer forwards to. */
interface QueueBinding<Body> {
	send(body: Body, options?: { delaySeconds?: number }): Promise<void>;
	sendBatch(
		messages: { body: Body; delaySeconds?: number }[],
		options?: { delaySeconds?: number },
	): Promise<void>;
}

/** A typed producer for the queue bound as `binding`. Resolved at call time from the current bindings. */
export function queueProducer<Body>(binding: string): QueueProducer<Body> {
	const queue = () => {
		const producer = currentBindings()[binding] as QueueBinding<Body> | undefined;
		if (!producer) throw new Error(`Queue binding ${binding} is not available`);
		return producer;
	};
	return {
		send: (body, options) => queue().send(body, options),
		sendBatch: (messages, options) =>
			queue().sendBatch(
				messages.map((body) => ({ body })),
				options,
			),
	};
}
