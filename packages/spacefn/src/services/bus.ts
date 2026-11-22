import { Context, Effect, Layer, PubSub, Schema, type Scope, Stream } from "effect";

export class BusError extends Schema.TaggedError<BusError>()("BusError", {
	operation: Schema.Literals(["publish", "subscribe"]),
	topic: Schema.String,
	cause: Schema.optional(Schema.Defect()),
}) {}

export interface BusShape {
	/** Sends `message` to everyone subscribed to `topic` right now. Nothing is stored. */
	readonly publish: (topic: string, message: string) => Effect.Effect<void, BusError>;
	/**
	 * Subscribes to `topic` for as long as the scope lives. The subscription is
	 * open once this Effect returns, so a page can subscribe, render the current
	 * state, and still see every update published after that.
	 */
	readonly subscribe: (
		topic: string,
	) => Effect.Effect<Stream.Stream<string, BusError>, BusError, Scope.Scope>;
}

/**
 * Fan-out of change notices to live connections (SSE re-renders). A Durable
 * Object hub on Cloudflare, PubSub plus the state database on Bun (so other
 * processes reach it), an in-process PubSub in tests.
 */
export class Bus extends Context.Service<Bus, BusShape>()("spacefn/Bus") {
	static readonly publish = (topic: string, message: string): Effect.Effect<void, BusError, Bus> =>
		Bus.use((bus) => bus.publish(topic, message));
	static readonly subscribe = (
		topic: string,
	): Effect.Effect<Stream.Stream<string, BusError>, BusError, Bus | Scope.Scope> =>
		Bus.use((bus) => bus.subscribe(topic));

	static readonly memory: Layer.Layer<Bus> = Layer.sync(Bus, () => {
		const topics = new Map<string, PubSub.PubSub<string>>();
		const topicOf = (topic: string) =>
			Effect.gen(function* () {
				const existing = topics.get(topic);
				if (existing) return existing;
				const created = yield* PubSub.unbounded<string>();
				topics.set(topic, created);
				return created;
			});
		return {
			publish: (topic, message) =>
				Effect.suspend(() => {
					const pubsub = topics.get(topic);
					return pubsub ? Effect.asVoid(PubSub.publish(pubsub, message)) : Effect.void;
				}),
			subscribe: (topic) =>
				topicOf(topic).pipe(
					Effect.flatMap(PubSub.subscribe),
					Effect.map((subscription) => Stream.fromSubscription(subscription)),
				),
		};
	});
}
