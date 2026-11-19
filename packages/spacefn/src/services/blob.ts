import { Clock, Context, Effect, Layer, Option, Schema } from "effect";

export class BlobError extends Schema.TaggedError<BlobError>()("BlobError", {
	operation: Schema.Literals(["get", "put", "delete", "list"]),
	key: Schema.String,
	cause: Schema.optional(Schema.Defect()),
}) {}

export interface BlobObject {
	readonly key: string;
	readonly body: Uint8Array;
	readonly size: number;
	readonly contentType: string | undefined;
	readonly uploadedAt: Date;
}

export interface BlobPutOptions {
	readonly contentType?: string;
}

export interface BlobListOptions {
	/** Only keys starting with this. */
	readonly prefix?: string;
	/** At most this many keys, in key order. */
	readonly limit?: number;
}

export interface BlobShape {
	readonly put: (
		key: string,
		body: Uint8Array | string,
		options?: BlobPutOptions,
	) => Effect.Effect<void, BlobError>;
	readonly get: (key: string) => Effect.Effect<Option.Option<BlobObject>, BlobError>;
	readonly delete: (key: string) => Effect.Effect<void, BlobError>;
	readonly list: (options?: BlobListOptions) => Effect.Effect<ReadonlyArray<string>, BlobError>;
}

const encoder = new TextEncoder();

/** Object storage for files and uploads. R2 on Cloudflare, a directory on Bun, a Map in tests. */
export class Blob extends Context.Service<Blob, BlobShape>()("spacefn/Blob") {
	static readonly memory: Layer.Layer<Blob> = Layer.sync(Blob, () => {
		const objects = new Map<string, BlobObject>();
		return {
			put: (key, body, options) =>
				Effect.map(Clock.currentTimeMillis, (now) => {
					// Copy, so later changes to the caller's buffer don't reach the store.
					const bytes = typeof body === "string" ? encoder.encode(body) : body.slice();
					objects.set(key, {
						key,
						body: bytes,
						size: bytes.byteLength,
						contentType: options?.contentType,
						uploadedAt: new Date(now),
					});
				}),
			get: (key) => Effect.sync(() => Option.fromNullishOr(objects.get(key))),
			delete: (key) => Effect.sync(() => void objects.delete(key)),
			list: (options) =>
				Effect.sync(() => {
					const keys = [...objects.keys()]
						.filter((key) => key.startsWith(options?.prefix ?? ""))
						.sort();
					return options?.limit === undefined ? keys : keys.slice(0, options.limit);
				}),
		};
	});
}
