import type { Context } from "hono";

import type { AppBindings } from "./env";

export type HandlerResult = Response | string | unknown | null | undefined;

export type Handler = (c: Context<{ Bindings: AppBindings; Variables: Record<string, unknown> }>) => HandlerResult | Promise<HandlerResult>;

/**
 * Wraps a route handler. A returned `Response` passes through, a string
 * becomes text, `undefined` becomes 204, anything else becomes JSON.
 */
export function defineHandler(handler: Handler) {
	return async (c: Context): Promise<Response> => {
		const result = await handler(c as Context<{ Bindings: AppBindings; Variables: Record<string, unknown> }>);
		if (result instanceof Response) return result;
		if (typeof result === "string") return c.text(result);
		if (result === undefined) return c.body(null, 204);
		return c.json(result);
	};
}
