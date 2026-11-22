import { Context, Effect, Layer, Predicate } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";

import { SpaceError } from "../errors.ts";
import type { ManifestRoute, Unchecked } from "../manifest.ts";
import { noMiddleware, type AroundRoute, type HttpApp } from "./middleware.ts";
import { handleErrors, toResponse } from "./respond.ts";

export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
export type Method = (typeof METHODS)[number];

/** A handler: any Effect. Its value becomes the response (see `toResponse`). */
export type Handler<A = unknown, E = unknown, R = any> = Effect.Effect<A, E, R>;

export type RouteMethods = { readonly [M in Method]?: Handler };

const RouteTypeId = "~spacefn/Route";

/** Wraps each of a page's or route's requests, inside the folders' `_middleware.ts`: a {@link middleware}, or any function like one. */
export type Handle = (next: HttpApp) => HttpApp;

export interface Route<Methods extends RouteMethods = RouteMethods> {
	readonly [RouteTypeId]: typeof RouteTypeId;
	readonly methods: Methods;
	readonly handle: Handle | undefined;
}

/**
 * Declares the handlers of a file in `app/routes/`, one Effect per HTTP method.
 *
 * ```ts
 * export default route({
 *   GET: Effect.gen(function* () {
 *     const { id } = yield* Input.params(Schema.Struct({ id: Schema.FiniteFromString }));
 *     return yield* Todos.find(id);
 *   }),
 * });
 * ```
 *
 * `handle` wraps every method, e.g. a guard for the whole route:
 * `handle: (next) => Effect.andThen(requireAdmin, next)`.
 */
export const route = <const Methods extends RouteMethods>({
	handle,
	...methods
}: Methods & { readonly handle?: Handle }): Route<Methods> => ({
	[RouteTypeId]: RouteTypeId,
	methods: methods as unknown as Methods,
	handle,
});

export const isRoute = (value: unknown): value is Route =>
	Predicate.hasProperty(value, RouteTypeId);

/** The convention file being served, so input accessors can name the catch-all parameter. */
export class CurrentRoute extends Context.Service<
	CurrentRoute,
	{ readonly file: string; readonly catchAll: string | undefined }
>()("spacefn/http/CurrentRoute") {}

const routeError = (entry: Unchecked<ManifestRoute>, message: string, hint: string) =>
	new SpaceError({ code: "ROUTE_EXPORT", message, hint, file: entry.file });

const definitionOf = (entry: Unchecked<ManifestRoute>): Effect.Effect<Route, SpaceError> => {
	const value = (entry.module as { default?: unknown }).default;
	if (!isRoute(value))
		return Effect.fail(
			routeError(
				entry,
				"The default export is not a route or a page",
				"Export one with: export default route({ GET: ... }), or export default page({ render: ... })",
			),
		);
	if (!METHODS.some((method) => value.methods[method] !== undefined))
		return Effect.fail(
			routeError(entry, "The route has no handlers", `Add at least one of ${METHODS.join(", ")}.`),
		);
	return Effect.succeed(value);
};

export const noHandle: Handle = (next) => next;

const methodNotAllowed = (allowed: readonly Method[]) =>
	HttpServerResponse.jsonUnsafe(
		{ error: "MethodNotAllowed", message: `Use ${allowed.join(", ")}` },
		{ status: 405, headers: { allow: allowed.join(", ") } },
	);

/**
 * Registers every route of the manifest on the router. Each handler's failures
 * are answered by `handleErrors`; a method a file does not handle is a 405
 * with an `Allow` header. A file without a valid default export fails the
 * layer, so a broken app stops at startup, not at the first request.
 *
 * Handler requirements are not tracked here: route modules are `unknown` to
 * the core, and the target provides the app's services (the entry's `services`, the
 * runtime Layers) around the whole router.
 */
export const routesLayer = (
	routes: readonly Unchecked<ManifestRoute>[],
	around: AroundRoute = noMiddleware,
): Layer.Layer<never, SpaceError, HttpRouter.HttpRouter> =>
	Layer.effectDiscard(
		Effect.gen(function* () {
			const router = yield* HttpRouter.HttpRouter;
			for (const entry of routes) {
				const { methods, handle = noHandle } = yield* definitionOf(entry);
				const current = CurrentRoute.of({ file: entry.file, catchAll: entry.catchAll });
				const allowed = METHODS.filter((method) => methods[method] !== undefined);
				for (const method of allowed) {
					const handler = methods[method] as Handler<unknown, unknown, never>; // see the note above
					yield* router.add(
						method,
						entry.path,
						// `handle`, then the folders' middleware, wrap the handler; their failures are answered too.
						handleErrors(
							around(
								entry.file,
								handleErrors(handle(handleErrors(Effect.flatMap(handler, toResponse)))),
							),
						).pipe(
							Effect.provideService(CurrentRoute, current),
						) as Effect.Effect<HttpServerResponse.HttpServerResponse>, // see the note above
					);
				}
				const notAllowed = methodNotAllowed(allowed);
				for (const method of METHODS)
					if (!allowed.includes(method))
						yield* router.add(method, entry.path, Effect.succeed(notAllowed));
			}
		}),
	);
