import { Duration, Effect, Layer, Option } from "effect";
import { Blob, BlobError, Kv, KvError, Queue, QueueError, type ManifestQueue } from "spacefn";

import { binding, type WorkerEnv } from "./bindings.ts";

/** The Workers KV namespace `Kv` uses. */
export const KV_BINDING = "KV";
/** The R2 bucket `Blob` uses. */
export const BLOB_BINDING = "BLOB";

/** Workers KV refuses shorter expiries, so shorter TTLs are raised to this. */
const MIN_KV_TTL_SECONDS = 60;

/**
 * `Kv` on Workers KV. Reads are eventually consistent across locations, and a
 * TTL under 60 seconds is raised to 60, the shortest Workers KV keeps.
 */
export const kvLayer = (env: WorkerEnv): Layer.Layer<Kv> =>
	Layer.sync(Kv, () => {
		const kv = () => binding<KVNamespace>(env, KV_BINDING, "Workers KV");
		const fail = (operation: KvError["operation"], key: string) => (cause: unknown) =>
			new KvError({ operation, key, cause });
		return {
			get: (key) =>
				Effect.tryPromise({ try: () => kv().get(key), catch: fail("get", key) }).pipe(
					Effect.map(Option.fromNullishOr),
				),
			set: (key, value, options) =>
				Effect.tryPromise({
					try: () =>
						kv().put(
							key,
							value,
							options?.ttl === undefined
								? undefined
								: {
										expirationTtl: Math.max(
											MIN_KV_TTL_SECONDS,
											Math.ceil(Duration.toSeconds(Duration.fromInputUnsafe(options.ttl))),
										),
									},
						),
					catch: fail("set", key),
				}),
			delete: (key) =>
				Effect.tryPromise({ try: () => kv().delete(key), catch: fail("delete", key) }),
		};
	});

/** `Blob` on R2. */
export const blobLayer = (env: WorkerEnv): Layer.Layer<Blob> =>
	Layer.sync(Blob, () => {
		const bucket = () => binding<R2Bucket>(env, BLOB_BINDING, "R2");
		const fail = (operation: BlobError["operation"], key: string) => (cause: unknown) =>
			new BlobError({ operation, key, cause });
		return {
			put: (key, body, options) =>
				Effect.tryPromise({
					try: () =>
						bucket().put(
							key,
							body,
							options?.contentType ? { httpMetadata: { contentType: options.contentType } } : {},
						),
					catch: fail("put", key),
				}).pipe(Effect.asVoid),
			get: (key) =>
				Effect.tryPromise({
					try: async () => {
						const object = await bucket().get(key);
						if (!object) return Option.none();
						const body = new Uint8Array(await object.arrayBuffer());
						return Option.some({
							key,
							body,
							size: object.size,
							contentType: object.httpMetadata?.contentType,
							uploadedAt: object.uploaded,
						});
					},
					catch: fail("get", key),
				}),
			delete: (key) =>
				Effect.tryPromise({ try: () => bucket().delete(key), catch: fail("delete", key) }),
			list: (options) =>
				Effect.tryPromise({
					try: async () => {
						const keys: string[] = [];
						const limit = options?.limit ?? Number.POSITIVE_INFINITY;
						let cursor: string | undefined;
						while (keys.length < limit) {
							const page = await bucket().list({
								prefix: options?.prefix,
								cursor,
								limit: Math.min(1000, limit - keys.length),
							});
							keys.push(...page.objects.map((object) => object.key));
							if (!page.truncated) break;
							cursor = page.cursor;
						}
						return keys;
					},
					catch: fail("list", options?.prefix ?? ""),
				}),
		};
	});

/** `Queue` on Cloudflare Queues: each `app/queues/<name>.ts` has a producer binding `QUEUE_<NAME>`. */
export const queueLayer = (
	env: WorkerEnv,
	queues: readonly Pick<ManifestQueue, "name" | "binding">[],
): Layer.Layer<Queue> =>
	Layer.succeed(Queue, {
		send: (name, body, options) => {
			const entry = queues.find((queue) => queue.name === name);
			if (!entry)
				return Effect.fail(
					new QueueError({
						queue: name,
						message: `No queue named ${name}; add app/queues/${name}.ts`,
					}),
				);
			return Effect.tryPromise({
				try: () =>
					binding<globalThis.Queue>(env, entry.binding, "Queues").send(
						body,
						options?.delay === undefined
							? undefined
							: {
									delaySeconds: Math.ceil(
										Duration.toSeconds(Duration.fromInputUnsafe(options.delay)),
									),
								},
					),
				catch: (cause) =>
					new QueueError({ queue: name, message: "The message wasn't sent", cause }),
			}).pipe(Effect.asVoid);
		},
	});
