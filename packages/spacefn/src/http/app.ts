import { Context, Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";

import type { SpaceError } from "../errors.ts";
import type { ManifestMiddleware, ManifestRoute, Unchecked } from "../manifest.ts";
import { pagesLayer } from "../pages/page.ts";
import { middlewareLayer } from "./middleware.ts";
import { routesLayer } from "./route.ts";

/**
 * Everything HTTP in the app, for a target to serve: the routes, the pages and
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
): Layer.Layer<never, SpaceError | E, HttpRouter.HttpRouter> =>
	Layer.unwrap(
		Effect.gen(function* () {
			// Built once, so middleware and handlers share the same instances.
			const context = (
				services ? yield* Layer.build(services) : Context.empty()
			) as Context.Context<any>;
			const provided = HttpRouter.provideRequest(Layer.succeedContext(context));
			return Layer.mergeAll(
				routesLayer(manifest.routes).pipe(provided),
				pagesLayer(manifest.routes).pipe(provided),
				middlewareLayer(manifest.middleware, context),
			) as Layer.Layer<never, SpaceError, HttpRouter.HttpRouter>;
		}),
	);
