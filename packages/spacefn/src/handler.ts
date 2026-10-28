import type { Context } from "hono";

import type { AppBindings } from "./env";

export type HandlerResult = unknown;

export type Handler = (
	c: Context<{ Bindings: AppBindings; Variables: Record<string, unknown> }>,
) => HandlerResult;

export interface HandlerOptions {
	/** Called when the handler throws. Defaults to logging the error. */
	onError?: (error: unknown, c: Context) => Response | Promise<Response>;
}

/**
 * Wraps a route handler. A returned `Response` passes through, a string
 * becomes text, `undefined` becomes 204, anything else becomes JSON.
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
			console.error("[spacefn] handler error", error);
			return c.json({ error: "internal_error", message: "Something went wrong" }, 500);
		}
	};
}

import { SpaceError } from "./errors";

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
