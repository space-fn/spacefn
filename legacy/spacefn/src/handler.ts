import type { Context } from "hono";

import type { AppBindings } from "./env";
import { SpaceError } from "./errors";

export type HandlerResult = unknown;

export type Handler = (
	c: Context<{ Bindings: AppBindings; Variables: Record<string, unknown> }>,
) => HandlerResult;

export interface HandlerOptions {
	/** Called when the handler throws. Without it the error goes to the app's `app.onError`. */
	onError?: (error: unknown, c: Context) => Response | Promise<Response>;
}

/**
 * Wraps a route handler. A returned `Response` passes through, a string
 * becomes text, `undefined` becomes 204, anything else becomes JSON.
 * A thrown error goes to `options.onError` when given, else to `app.onError`,
 * so an app maps its own errors in one place.
 */
export function defineHandler(handler: Handler, options: HandlerOptions = {}) {
	return async (c: Context): Promise<Response> => {
		try {
			const result = await handler(
				c as Context<{ Bindings: AppBindings; Variables: Record<string, unknown> }>,
			);
			if (result instanceof Response) return result;
			if (typeof result === "string") return c.text(result);
			if (result === undefined) return c.body(null, 204);
			return c.json(result);
		} catch (error) {
			if (options.onError) return options.onError(error, c);
			throw error;
		}
	};
}

/**
 * Default error handler. Maps SpaceError (with a status) to a matching HTTP
 * response and hides internals otherwise.
 */
export function onError(error: unknown, c: Context): Response {
	if (error instanceof SpaceError && error.status && error.status >= 400 && error.status < 600) {
		return c.json({ error: error.code, message: error.message }, error.status as never);
	}
	console.error("[spacefn] handler error", error);
	return c.json({ error: "internal_error", message: "Something went wrong" }, 500);
}
