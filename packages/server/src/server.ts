// --- Server -------------------------------------------------------------------
// createServer() — h3 wrapper with Web Request/Response model

import { createApp, createRouter, eventHandler, toWebHandler, toWebRequest } from "h3";

import type { ServerOptions } from "./types.js";

// --- Default error handler ----------------------------------------------------

function defaultErrorHandler(error: unknown, _request: Request): Response {
	console.error("[space] Error:", error);
	const message = error instanceof Error ? error.message : "Internal Server Error";
	return new Response(message, { status: 500 });
}

// --- Create server ------------------------------------------------------------

export function createServer(options: ServerOptions) {
	const { routes, middlewares = [], onError = defaultErrorHandler } = options;

	const router = createRouter();

	// --- Register routes ------------------------------------------------------
	for (const route of routes) {
		const handler = eventHandler(async (event) => {
			const request = toWebRequest(event);
			const mod = await route.handler();
			return mod.default(request);
		});

		if (route.method === "*") {
			router.use(route.pattern, handler);
		} else {
			router.add(
				route.pattern,
				handler,
				route.method.toLowerCase() as "get" | "post" | "put" | "delete" | "patch",
			);
		}
	}

	const app = createApp({
		onError: (error: unknown, event: unknown) => {
			const request = toWebRequest(event as Parameters<typeof toWebRequest>[0]);
			return onError(error, request);
		},
	});

	// --- Register middlewares (use for every request) -------------------------
	for (const mw of middlewares) {
		app.use(
			eventHandler(async (event) => {
				const request = toWebRequest(event);
				const next = async () => {
					return new Response("", { status: 200 });
				};
				const response = await mw.handler(request, next);
				if (response && response.status !== 200) {
					return response;
				}
			}),
		);
	}

	// --- Mount router ---------------------------------------------------------
	app.use(router.handler as ReturnType<typeof eventHandler>);

	// --- Return Web API handler for Cloudflare Workers ------------------------
	return toWebHandler(app);
}

export type {
	ServerOptions,
	Route,
	Middleware,
	RouteHandler,
	MiddlewareHandler,
	NextFunction,
} from "./types.js";
