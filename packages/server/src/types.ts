// --- Server Types --------------------------------------------------------------

/** HTTP methods */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "*";

/** Route handler function */
export type RouteHandler = (request: Request) => Response | Promise<Response>;

/** Route definition */
export interface Route {
	/** URL pattern (e.g., "/books/:slug") */
	pattern: string;
	/** HTTP method ( "*" = all methods ) */
	method: HttpMethod;
	/** Lazy import of handler module */
	handler: () => Promise<{ default: RouteHandler }>;
}

/** Middleware next function */
export type NextFunction = () => Promise<Response>;

/** Middleware handler */
export type MiddlewareHandler = (
	request: Request,
	next: NextFunction,
) => Response | Promise<Response>;

/** Middleware definition */
export interface Middleware {
	/** Middleware name (for debugging) */
	name: string;
	/** Middleware handler */
	handler: MiddlewareHandler;
}

/** Server options */
export interface ServerOptions {
	/** Route definitions */
	routes: Route[];
	/** Middleware chain */
	middlewares?: Middleware[];
	/** Error handler */
	onError?: (error: unknown, request: Request) => Response | Promise<Response>;
}
