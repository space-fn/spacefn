import { Effect, Layer, Predicate } from "effect";
import { HttpRouter, type HttpServerResponse } from "effect/http";

import { SpaceError } from "../errors.ts";
import type { ManifestMiddleware, Unchecked } from "../manifest.ts";
import { handleErrors } from "./respond.ts";

/** The rest of the request: later middleware, then the matched route. */
export type HttpApp = Effect.Effect<HttpServerResponse.HttpServerResponse, unknown, any>;

const MiddlewareTypeId = "~spacefn/Middleware";

export interface Middleware {
	readonly [MiddlewareTypeId]: typeof MiddlewareTypeId;
	readonly apply: (next: HttpApp) => HttpApp;
}

/**
 * Declares a file in `app/middleware/`. It wraps every request: run code
 * before `next`, change its response after, or answer without calling it.
 * Files run in file-name order (`1-auth.ts` before `2-log.ts`), the first
 * one outermost.
 *
 * ```ts
 * export default middleware((next) =>
 *   Effect.map(next, HttpServerResponse.setHeader("x-frame-options", "DENY")),
 * );
 * ```
 */
export const middleware = (apply: (next: HttpApp) => HttpApp): Middleware => ({
	[MiddlewareTypeId]: MiddlewareTypeId,
	apply,
});

export const isMiddleware = (value: unknown): value is Middleware =>
	Predicate.hasProperty(value, MiddlewareTypeId);

const loadMiddleware = (
	entry: Unchecked<ManifestMiddleware>,
): Effect.Effect<Middleware, SpaceError> => {
	const value = (entry.module as { default?: unknown }).default;
	return isMiddleware(value)
		? Effect.succeed(value)
		: Effect.fail(
				new SpaceError({
					code: "MIDDLEWARE_EXPORT",
					message: "The default export is not a middleware",
					hint: "Export it with: export default middleware((next) => ...)",
					file: entry.file,
				}),
			);
};

/**
 * Applies the app's middleware to every request, with error handling
 * outermost: a failure in middleware, a handler or the router itself (no
 * matching route) becomes a proper response.
 */
export const middlewareLayer = (
	entries: readonly Unchecked<ManifestMiddleware>[],
): Layer.Layer<never, SpaceError, HttpRouter.HttpRouter> =>
	Layer.unwrap(
		Effect.gen(function* () {
			const chain = yield* Effect.forEach(entries, loadMiddleware);
			const apply = (app: HttpApp): HttpApp =>
				chain.reduceRight((next, middleware) => middleware.apply(next), app);
			return HttpRouter.middleware((app) => handleErrors(apply(app)) as never, {
				global: true,
			}) as Layer.Layer<never, never, HttpRouter.HttpRouter>;
		}),
	);
