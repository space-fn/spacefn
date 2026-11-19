import { ConfigProvider, Layer } from "effect";

import { Blob } from "./services/blob.ts";
import { Bus } from "./services/bus.ts";
import { Kv } from "./services/kv.ts";
import { Queue, QueueInbox } from "./services/queue.ts";

export { QueueInbox, type QueueInboxShape, type SentMessage } from "./services/queue.ts";

/** Every runtime service backed by memory. Each build starts empty, so tests don't share state. */
export const memoryServices: Layer.Layer<Blob | Bus | Kv | Queue | QueueInbox> = Layer.mergeAll(
	Blob.memory,
	Bus.memory,
	Kv.memory,
	Queue.memory,
);

/** Env values for `defineEnv` in tests: `Effect.provide(AppEnv.layer.pipe(Layer.provide(testEnv({ API_KEY: "x" }))))`. */
export const testEnv = (values: Record<string, unknown>): Layer.Layer<never> =>
	ConfigProvider.layer(ConfigProvider.fromUnknown(values));
