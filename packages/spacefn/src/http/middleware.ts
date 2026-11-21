import { Context, Effect, Layer, Predicate } from "effect";
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
 * Declares middleware for a `_middleware.ts` file. It wraps a request: run
 * code before `next`, change its response after, or answer without calling
 * it. `app/routes/_middleware.ts` wraps every request; one in a folder below
 * wraps that folder's routes and pages, inside the outer ones. Export one, or
 * an array that runs first to last, the first outermost.
 *
 * ```ts
 * // app/routes/admin/_middleware.ts
 * export default [
 *   requireUser,
 *   middleware((next) => Effect.map(next, HttpServerResponse.setHeader("x-frame-options", "DENY"))),
 * ];
 * ```
 */
export const middleware = (apply: (next: HttpApp) => HttpApp): Middleware => ({
	[MiddlewareTypeId]: MiddlewareTypeId,
	apply,
});

export const isMiddleware = (value: unknown): value is Middleware =>
	Predicate.hasProperty(value, MiddlewareTypeId);

/** Where `_middleware.ts` files live; the one directly in it wraps every request. */
export const ROUTES_FOLDER = "app/routes";

const loadMiddleware = (
	entry: Unchecked<ManifestMiddleware>,
): Effect.Effect<readonly Middleware[], SpaceError> => {
	const value = (entry.module as { default?: unknown }).default;
	const list: readonly unknown[] = Array.isArray(value) ? value : [value];
	return list.length > 0 && list.every(isMiddleware)
		? Effect.succeed(list)
		: Effect.fail(
				new SpaceError({
					code: "MIDDLEWARE_EXPORT",
					message: "The default export is not a middleware or an array of them",
					hint: "Export it with: export default middleware((next) => ...), or export default [a, b]",
					file: entry.file,
				}),
			);
};

const chainOf =
	(chain: readonly Middleware[]) =>
	(app: HttpApp): HttpApp =>
		chain.reduceRight((next, middleware) => middleware.apply(next), app);

/**
 * Applies `before` (the entry's), then `app/routes/_middleware.ts`, to every request, with error handling
 * outermost: a failure in middleware, a handler or the router itself (no
 * matching route) becomes a proper response. `services` is provided to the
 * middleware (the routes get the same context from `httpLayer`).
 */
export const middlewareLayer = (
	entries: readonly Unchecked<ManifestMiddleware>[],
	services: Context.Context<any> = Context.empty() as Context.Context<any>,
	before: readonly Middleware[] = [],
): Layer.Layer<never, SpaceError, HttpRouter.HttpRouter> =>
	Layer.unwrap(
		Effect.gen(function* () {
			const apply = chainOf([
				...before,
				...(yield* Effect.forEach(entries, loadMiddleware)).flat(),
			]);
			return HttpRouter.middleware(
				(app) => Effect.provideContext(handleErrors(apply(app)), services) as never,
				{ global: true },
			) as Layer.Layer<never, never, HttpRouter.HttpRouter>;
		}),
	);

/** Wraps a route's or page's handler, given its file, in the middleware of the folders it is in. */
export type AroundRoute = (file: string, app: HttpApp) => HttpApp;

export const noMiddleware: AroundRoute = (_, app) => app;

/**
 * The `_middleware.ts` files below `app/routes/`, outer folders first, as an
 * {@link AroundRoute}. Loaded once, so a bad export fails at startup.
 */
export const scopedMiddleware = (
	entries: readonly Unchecked<ManifestMiddleware>[],
): Effect.Effect<AroundRoute, SpaceError> =>
	Effect.map(
		Effect.forEach(entries, (entry) =>
			Effect.map(loadMiddleware(entry), (chain) => ({ folder: entry.folder, chain })),
		),
		(loaded) => {
			const byDepth = [...loaded].sort((a, b) => a.folder.length - b.folder.length);
			return (file, app) =>
				chainOf(
					byDepth
						.filter(({ folder }) => file.startsWith(`${folder}/`))
						.flatMap(({ chain }) => chain),
				)(app);
		},
	);
