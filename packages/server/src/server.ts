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
	const { routes, pages = [], middlewares = [], onError = defaultErrorHandler } = options;

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

	// --- Register pages (GET loader + POST actions) ---------------------------
	for (const page of pages) {
		// GET handler: run loader, render page
		if (page.loader || page.page) {
			const getHandler = eventHandler(async (event) => {
				const request = toWebRequest(event);
				const data = page.loader ? await page.loader(request) : undefined;
				const html = page.page ? page.page(data) : "";
				return new Response(String(html), {
					headers: { "Content-Type": "text/html" },
				});
			});
			router.add(page.pattern, getHandler, "get");
		}

		// POST handler: run matching action by _action query param
		if (page.actions && Object.keys(page.actions).length > 0) {
			const postHandler = eventHandler(async (event) => {
				const request = toWebRequest(event);
				const url = new URL(request.url);
				const actionName = url.searchParams.get("_action");

				if (!actionName || !page.actions?.[actionName]) {
					return new Response("Unknown action", { status: 400 });
				}

				const action = page.actions[actionName];
				let payload: unknown;

				// Parse payload based on action type
				if (action.type === "multipart-form") {
					payload = await request.formData();
				} else {
					const text = await request.text();
					try {
						payload = JSON.parse(text);
					} catch {
						payload = Object.fromEntries(new URLSearchParams(text));
					}
				}

				// Validate with input schema if provided
				if (action.input) {
					if (action.input.safeParse) {
						const result = action.input.safeParse(payload);
						if (!result.success) {
							return new Response(JSON.stringify(result), {
								status: 400,
								headers: { "Content-Type": "application/json" },
							});
						}
						payload = result.data;
					} else if (action.input.parse) {
						payload = action.input.parse(payload);
					}
				}

				const result = await action.resolver(payload);

				// Handle response types
				if (result instanceof Response) {
					return result;
				}
				if (typeof result === "string") {
					return new Response(result, {
						headers: { "Content-Type": "text/html" },
					});
				}
				return new Response(JSON.stringify(result), {
					headers: { "Content-Type": "application/json" },
				});
			});
			router.add(page.pattern, postHandler, "post");
		}
	}

	const app = createApp({
		onError: (error: unknown, event: unknown) => {
			const request = toWebRequest(event as Parameters<typeof toWebRequest>[0]);
			return onError(error, request);
		},
	});

	// --- Mount router ---------------------------------------------------------
	app.use(router.handler as ReturnType<typeof eventHandler>);

	// --- Compose middlewares around the router -------------------------------
	const handler = toWebHandler(app);
	return async (request: Request): Promise<Response> => {
		let index = -1;

		const dispatch = async (position: number): Promise<Response> => {
			if (position <= index) {
				throw new Error("Middleware called next() multiple times");
			}
			index = position;

			const middleware = middlewares[position];
			if (!middleware) return handler(request);

			return middleware.handler(request, () => dispatch(position + 1));
		};

		try {
			return await dispatch(0);
		} catch (error) {
			return onError(error, request);
		}
	};
}

export type {
	ServerOptions,
	Route,
	Middleware,
	RouteHandler,
	MiddlewareHandler,
	NextFunction,
} from "./types.js";
