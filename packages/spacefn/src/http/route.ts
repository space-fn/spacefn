import { Context, Effect, Layer, Predicate } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";

import { SpaceError } from "../errors.ts";
import type { ManifestRoute } from "../manifest.ts";
import { handleErrors, toResponse } from "./respond.ts";

export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
export type Method = (typeof METHODS)[number];

/** A handler: any Effect. Its value becomes the response (see `toResponse`). */
export type Handler<A = unknown, E = unknown, R = any> = Effect.Effect<A, E, R>;

export type RouteMethods = { readonly [M in Method]?: Handler };

const RouteTypeId = "~spacefn/Route";

export interface Route<Methods extends RouteMethods = RouteMethods> {
	readonly [RouteTypeId]: typeof RouteTypeId;
	readonly methods: Methods;
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
 */
export const route = <const Methods extends RouteMethods>(methods: Methods): Route<Methods> => ({
	[RouteTypeId]: RouteTypeId,
	methods,
});

export const isRoute = (value: unknown): value is Route =>
	Predicate.hasProperty(value, RouteTypeId);

/** The convention file being served, so input accessors can name the catch-all parameter. */
export class CurrentRoute extends Context.Service<
	CurrentRoute,
	{ readonly file: string; readonly catchAll: string | undefined }
>()("spacefn/http/CurrentRoute") {}

const routeError = (entry: ManifestRoute, message: string, hint: string) =>
	new SpaceError({ code: "ROUTE_EXPORT", message, hint, file: entry.file });

const definitionOf = (entry: ManifestRoute): Effect.Effect<Route, SpaceError> => {
	const value = (entry.module as { default?: unknown }).default;
	if (!isRoute(value))
		return Effect.fail(
			routeError(
				entry,
				"The default export is not a route",
				"Export the handlers with: export default route({ GET: ... })",
			),
		);
	if (!METHODS.some((method) => value.methods[method] !== undefined))
		return Effect.fail(
			routeError(entry, "The route has no handlers", `Add at least one of ${METHODS.join(", ")}.`),
		);
	return Effect.succeed(value);
};

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
 * the core, and the target provides the app's services (`app/layers.ts`, the
 * runtime Layers) around the whole router.
 */
export const routesLayer = (
	routes: readonly ManifestRoute[],
): Layer.Layer<never, SpaceError, HttpRouter.HttpRouter> =>
	Layer.effectDiscard(
		Effect.gen(function* () {
			const router = yield* HttpRouter.HttpRouter;
			for (const entry of routes) {
				if (entry.kind !== "route") continue; // pages are mounted by the pages module
				const { methods } = yield* definitionOf(entry);
				const current = CurrentRoute.of({ file: entry.file, catchAll: entry.catchAll });
				const allowed = METHODS.filter((method) => methods[method] !== undefined);
				for (const method of allowed) {
					const handler = methods[method] as Handler<unknown, unknown, never>; // see the note above
					yield* router.add(
						method,
						entry.path,
						handleErrors(Effect.flatMap(handler, toResponse)).pipe(
							Effect.provideService(CurrentRoute, current),
						),
					);
				}
				const notAllowed = methodNotAllowed(allowed);
				for (const method of METHODS)
					if (!allowed.includes(method))
						yield* router.add(method, entry.path, Effect.succeed(notAllowed));
			}
		}),
	);
