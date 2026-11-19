import { Context, type Duration, Effect, Layer, Schema } from "effect";

export class QueueError extends Schema.TaggedError<QueueError>()("QueueError", {
	queue: Schema.String,
	message: Schema.String,
	cause: Schema.optional(Schema.Defect()),
}) {}

export interface QueueSendOptions {
	/** Deliver no sooner than this. */
	readonly delay?: Duration.Input;
}

export interface QueueShape {
	/** Sends `body` to the `app/queues/<queue>.ts` consumer. The body must survive structured cloning. */
	readonly send: (
		queue: string,
		body: unknown,
		options?: QueueSendOptions,
	) => Effect.Effect<void, QueueError>;
}

/** Background jobs. Cloudflare Queues on Cloudflare, a table consumed by the queue process on Bun. */
export class Queue extends Context.Service<Queue, QueueShape>()("spacefn/Queue") {
	/** Records sent messages in {@link QueueInbox} instead of delivering them. */
	static readonly memory: Layer.Layer<Queue | QueueInbox> = Layer.effectContext(
		Effect.sync(() => {
			const sent: SentMessage[] = [];
			const queue: QueueShape = {
				send: (name, body, options) =>
					Effect.try({
						try: () =>
							void sent.push({ queue: name, body: structuredClone(body), delay: options?.delay }),
						catch: (cause) =>
							new QueueError({
								queue: name,
								message: "The message body cannot be serialized",
								cause,
							}),
					}),
			};
			const inbox: QueueInboxShape = {
				messages: Effect.sync(() => [...sent]),
				take: (name) =>
					Effect.sync(() => {
						const taken = sent.filter((m) => m.queue === name);
						sent.splice(0, sent.length, ...sent.filter((m) => m.queue !== name));
						return taken.map((m) => m.body);
					}),
			};
			return Context.make(Queue, queue).pipe(Context.add(QueueInbox, inbox));
		}),
	);
}

export interface SentMessage {
	readonly queue: string;
	readonly body: unknown;
	readonly delay: Duration.Input | undefined;
}

export interface QueueInboxShape {
	/** Every message sent so far, oldest first. */
	readonly messages: Effect.Effect<ReadonlyArray<SentMessage>>;
	/** Removes and returns the bodies sent to `queue`. */
	readonly take: (queue: string) => Effect.Effect<ReadonlyArray<unknown>>;
}

/** What `Queue.memory` recorded, for assertions in tests. */
export class QueueInbox extends Context.Service<QueueInbox, QueueInboxShape>()(
	"spacefn/QueueInbox",
) {}
