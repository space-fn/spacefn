import { Clock, Context, Duration, Effect, Layer, Option, Schema } from "effect";

export class KvError extends Schema.TaggedError<KvError>()("KvError", {
	operation: Schema.Literals(["get", "set", "delete"]),
	key: Schema.String,
	cause: Schema.optional(Schema.Defect()),
}) {}

export interface KvSetOptions {
	/** Drop the value after this long. */
	readonly ttl?: Duration.Input;
}

export interface KvShape {
	readonly get: (key: string) => Effect.Effect<Option.Option<string>, KvError>;
	readonly set: (
		key: string,
		value: string,
		options?: KvSetOptions,
	) => Effect.Effect<void, KvError>;
	readonly delete: (key: string) => Effect.Effect<void, KvError>;
}

/**
 * String key-value storage with optional expiry. Workers KV on Cloudflare, a
 * table in the app's libSQL database on Bun, a Map in tests.
 */
export class Kv extends Context.Service<Kv, KvShape>()("spacefn/Kv") {
	/** In-process store; TTLs follow the Effect Clock, so `TestClock` can move time. */
	static readonly memory: Layer.Layer<Kv> = Layer.sync(Kv, () => {
		const entries = new Map<string, { value: string; expiresAt: number | undefined }>();
		return {
			get: (key) =>
				Effect.map(Clock.currentTimeMillis, (now) => {
					const entry = entries.get(key);
					if (!entry) return Option.none();
					if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
						entries.delete(key);
						return Option.none();
					}
					return Option.some(entry.value);
				}),
			set: (key, value, options) =>
				Effect.map(Clock.currentTimeMillis, (now) => {
					const expiresAt =
						options?.ttl === undefined
							? undefined
							: now + Duration.toMillis(Duration.fromInputUnsafe(options.ttl));
					entries.set(key, { value, expiresAt });
				}),
			delete: (key) => Effect.sync(() => void entries.delete(key)),
		};
	});
}
