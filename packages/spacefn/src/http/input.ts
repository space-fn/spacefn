import { Effect, Schema } from "effect";
import { HttpRouter, HttpServerRequest } from "effect/http";

import { NotFound, type BadRequest } from "../errors.ts";
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

/** Typed access to the request inside a route handler. */
export const Input = { params, query } as const;
