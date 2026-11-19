import type { MiddlewareHandler } from "hono";

/** Declares a middleware file's default export. Same as writing the handler directly, with a name that says what it is. */
export function defineMiddleware(handler: MiddlewareHandler): MiddlewareHandler {
	return handler;
}
