import type { Context, Hono } from "hono";

import { SpaceError } from "../errors";

export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

export type RouteModule = Partial<Record<(typeof METHODS)[number], (c: Context) => unknown>>;

/** Registers every HTTP method export of a route module on `app`. */
export function mountRoute(app: Hono, path: string, module: RouteModule): void {
	let count = 0;
	for (const method of METHODS) {
		const handler = module[method];
		if (!handler) continue;
		app.on(method, path, handler as never);
		count++;
	}
	if (count === 0) {
		throw new SpaceError(
			"ROUTE_NO_HANDLERS",
			`Route ${path} exports no HTTP method handlers (${METHODS.join(", ")})`,
			{ hint: "Export at least one of GET/POST/PUT/PATCH/DELETE." },
		);
	}
}
