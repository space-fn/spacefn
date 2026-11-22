import { Effect, Schema } from "effect";
import { HttpRouter, HttpServerRequest } from "effect/http";

import { NotFound, type BadRequest } from "../errors.ts";
import { mediaType, readSimpleBody, type BodyError } from "./body.ts";
import { readMultipart, type UploadLimits } from "./multipart.ts";
import { badRequestFrom } from "./respond.ts";
import { CurrentRoute } from "./route.ts";

type Codec<A, I, RD> = Schema.Codec<A, I, RD>;

/** Path parameters, with a catch-all reported under its own name (`[...path]` gives `path`). */
const rawParams = Effect.gen(function* () {
	const params = { ...(yield* HttpRouter.params) };
	const current = yield* CurrentRoute;
	if (current.catchAll && "*" in params) {
		params[current.catchAll] = params["*"];
		delete params["*"];
	}
	return params;
});

/**
 * Decodes the path parameters. A value that does not decode means the URL names
 * nothing, so it is a 404, not a 400: `/todos/abc` when `id` must be a number.
 */
const params = <A, I extends Readonly<Record<string, string | undefined>>, RD>(
	schema: Codec<A, I, RD>,
): Effect.Effect<A, NotFound, HttpRouter.RouteContext | CurrentRoute | RD> =>
	Effect.flatMap(rawParams, (raw) =>
		Schema.decodeUnknownEffect(schema)(raw).pipe(
			Effect.mapError(() => new NotFound({ message: "No such resource" })),
		),
	);

/** Decodes the search parameters. Repeated keys arrive as arrays. */
const query = <
	A,
	I extends Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
	RD,
>(
	schema: Codec<A, I, RD>,
): Effect.Effect<A, BadRequest, HttpServerRequest.ParsedSearchParams | RD> =>
	Effect.gen(function* () {
		const search = yield* HttpServerRequest.ParsedSearchParams;
		return yield* Schema.decodeUnknownEffect(schema)(search).pipe(
			Effect.mapError((error) => badRequestFrom("query", error)),
		);
	});

/**
 * Reads and decodes the body: JSON, a URL-encoded form, or multipart with
 * files as `Upload`s (repeated keys as arrays). Too large is a 413, another
 * content type or a refused file type a 415, and malformed or not matching the
 * schema a 400 that lists the issues.
 */
const body = <A, I, RD>(
	schema: Codec<A, I, RD>,
	limits?: UploadLimits,
): Effect.Effect<A, BodyError, HttpServerRequest.HttpServerRequest | RD> =>
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const raw =
			mediaType(request) === "multipart/form-data"
				? yield* readMultipart(limits)
				: yield* readSimpleBody(limits);
		return yield* Schema.decodeUnknownEffect(schema)(raw).pipe(
			Effect.mapError((error) => badRequestFrom("body", error)),
		);
	});

/** Typed access to the request inside a route handler. */
export const Input = { params, query, body } as const;
