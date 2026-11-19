import { Layer } from "effect";
import type { HttpRouter } from "effect/http";

import type { SpaceError } from "../errors.ts";
import type { SpaceManifest } from "../manifest.ts";
import { middlewareLayer } from "./middleware.ts";
import { routesLayer } from "./route.ts";

/**
 * Everything HTTP in the app, for a target to serve: the routes and the
 * middleware chain, with every failure answered. Fails when a convention file
 * exports the wrong thing.
 */
export const httpLayer = (
	manifest: Pick<SpaceManifest, "routes" | "middleware">,
): Layer.Layer<never, SpaceError, HttpRouter.HttpRouter> =>
	Layer.mergeAll(routesLayer(manifest.routes), middlewareLayer(manifest.middleware));
