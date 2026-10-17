import type { Context } from "hono";

export type HandlerResult = Response | string | object | null | undefined;

export type Handler = (c: Context) => HandlerResult | Promise<HandlerResult>;

/**
 * Wraps a route handler. A returned `Response` passes through, a string
 * becomes text, `undefined` becomes 204, anything else becomes JSON.
 */
export function defineHandler(handler: Handler) {
	return async (c: Context): Promise<Response> => {
		const result = await handler(c);
		if (result instanceof Response) return result;
		if (typeof result === "string") return c.text(result);
		if (result === undefined) return c.body(null, 204);
		return c.json(result);
	};
}
