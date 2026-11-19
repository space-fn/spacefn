import { Effect } from "effect";
import { HttpServerRequest } from "effect/http";

import { BadRequest, PayloadTooLarge, UnsupportedMediaType } from "../errors.ts";

export interface BodyLimits {
	/** Largest accepted body, in bytes. Default 1 MiB, or 10 MiB for multipart. */
	readonly maxBytes?: number;
}

export type BodyError = BadRequest | PayloadTooLarge | UnsupportedMediaType;

export const MiB = 1024 * 1024;

class Oversized extends Error {}

/**
 * The request body as a web stream that errors once more than `limit` bytes
 * arrive. An honest `content-length` over the limit is refused before reading.
 */
export const limitedBody = (
	limit: number,
): Effect.Effect<Request, BodyError, HttpServerRequest.HttpServerRequest> =>
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const web = yield* HttpServerRequest.toWeb(request).pipe(
			Effect.mapError(() => new BadRequest({ message: "Could not read the request body" })),
		);
		if (Number(web.headers.get("content-length") ?? 0) > limit)
			return yield* new PayloadTooLarge({ limitBytes: limit });
		let received = 0;
		const body = web.body?.pipeThrough(
			new TransformStream<Uint8Array, Uint8Array>({
				transform(chunk, controller) {
					received += chunk.byteLength;
					if (received > limit) controller.error(new Oversized());
					else controller.enqueue(chunk);
				},
			}),
		);
		return new Request(web.url, {
			method: web.method,
			headers: web.headers,
			body: body ?? null,
			duplex: "half",
		} as RequestInit);
	});

/** Runs a body reader, turning the stream's size error into a 413 and anything else into a 400. */
export const readWith = <A>(
	limit: number,
	read: (request: Request) => Promise<A>,
	what: string,
): Effect.Effect<A, BodyError, HttpServerRequest.HttpServerRequest> =>
	Effect.flatMap(limitedBody(limit), (request) =>
		Effect.tryPromise({
			try: () => read(request),
			catch: (cause) =>
				cause instanceof Oversized || (cause instanceof Error && cause.cause instanceof Oversized)
					? new PayloadTooLarge({ limitBytes: limit })
					: new BadRequest({ message: `Malformed ${what} body` }),
		}),
	);

/** Collects form or search entries, keeping repeated keys as arrays (like search params). */
export const entriesToRecord = <V>(entries: Iterable<[string, V]>): Record<string, V | V[]> => {
	const record: Record<string, V | V[]> = {};
	for (const [key, value] of entries) {
		const existing = record[key];
		if (existing === undefined) record[key] = value;
		else if (Array.isArray(existing)) existing.push(value);
		else record[key] = [existing, value];
	}
	return record;
};

export const mediaType = (request: HttpServerRequest.HttpServerRequest): string =>
	(request.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() ?? "";

/** Reads a JSON or URL-encoded body into plain data, ready for a schema. */
export const readSimpleBody = (
	limits: BodyLimits = {},
): Effect.Effect<unknown, BodyError, HttpServerRequest.HttpServerRequest> =>
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const limit = limits.maxBytes ?? MiB;
		const type = mediaType(request);
		if (type === "application/json" || type.endsWith("+json"))
			return yield* readWith(limit, async (r) => JSON.parse(await r.text()) as unknown, "JSON");
		if (type === "application/x-www-form-urlencoded")
			return yield* readWith(
				limit,
				async (r) => entriesToRecord(new URLSearchParams(await r.text())),
				"form",
			);
		return yield* new UnsupportedMediaType({
			message: `Expected application/json or a form, got ${type || "no content type"}`,
		});
	});
