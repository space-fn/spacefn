import { Context, Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";

import type { SpaceError } from "../errors.ts";
import type { ManifestMiddleware, ManifestRoute, Unchecked } from "../manifest.ts";
import { isPage, pagesLayer } from "../pages/page.ts";
import { middlewareLayer, ROUTES_FOLDER, scopedMiddleware, type Middleware } from "./middleware.ts";
import { routesLayer } from "./route.ts";

/**
 * Everything HTTP in the app, for a target to serve: the routes and pages of `app/routes/` and
 * the middleware chain, with every failure answered, and `services` (the app's
 * Layers plus the target's runtime Layers) provided to all of it. Fails when a
 * convention file exports the wrong thing.
 */
export const httpLayer = <E = never>(
	manifest: {
		readonly routes: readonly Unchecked<ManifestRoute>[];
		readonly middleware: readonly Unchecked<ManifestMiddleware>[];
	},
	services?: Layer.Layer<any, E>,
	extra: {
		/** Middleware outside `app/routes/_middleware.ts`, around every request. */
		readonly before?: readonly Middleware[];
		/** Effect `HttpRouter` layers beside the file routes. */
		readonly routes?: readonly Layer.Any[];
	} = {},
): Layer.Layer<never, SpaceError | E, HttpRouter.HttpRouter> =>
	Layer.unwrap(
		Effect.gen(function* () {
			// Built once, so middleware and handlers share the same instances.
			const context = (
				services ? yield* Layer.build(services) : Context.empty()
			) as Context.Context<any>;
			const provided = HttpRouter.provideRequest(Layer.succeedContext(context));
			// One tree: a file's export decides whether it is served as a page or a route.
			const isPageFile = (entry: Unchecked<ManifestRoute>) =>
				isPage((entry.module as { default?: unknown }).default);
			const root = manifest.middleware.filter((entry) => entry.folder === ROUTES_FOLDER);
			const around = yield* scopedMiddleware(
				manifest.middleware.filter((entry) => entry.folder !== ROUTES_FOLDER),
			);
			return Layer.mergeAll(
				routesLayer(
					manifest.routes.filter((entry) => !isPageFile(entry)),
					around,
				).pipe(provided),
				pagesLayer(manifest.routes.filter(isPageFile), around).pipe(provided),
				middlewareLayer(root, context, extra.before),
				...(extra.routes ?? []).map((routes) =>
					(routes as Layer.Layer<never, never, HttpRouter.HttpRouter>).pipe(provided),
				),
			) as Layer.Layer<never, SpaceError, HttpRouter.HttpRouter>;
		}),
	);
