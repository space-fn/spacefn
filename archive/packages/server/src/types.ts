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
	/** Page definitions (generated from src/pages/) */
	pages?: PageRoute[];
	/** Middleware chain */
	middlewares?: Middleware[];
	/** Error handler */
	onError?: (error: unknown, request: Request) => Response | Promise<Response>;
}

/** Page route definition (generated from *.page.ts + *.server.ts) */
export interface PageRoute {
	/** URL pattern */
	pattern: string;
	/** Page loader function */
	loader?: LoaderFn;
	/** Page actions */
	actions?: ActionsConfig;
	/** Page component function */
	page?: (props: unknown) => unknown;
}

// --- Page Types (for *.server.ts + *.page.ts convention) ---------------------

/** Loader function: fetches data for a page */
export type LoaderFn<T = void> = (req: Request) => T | Promise<T>;

/** Action resolver result */
export type ActionResult = Response | object | unknown[];

/** Action resolver function */
export type ActionResolver<T = unknown> = (payload: T) => ActionResult | Promise<ActionResult>;

/** Action configuration */
export interface ActionConfig<T = unknown> {
	/** Form encoding type (default: "form") */
	type?: "form" | "multipart-form";
	/** HTTP method (default: "post") */
	method?: "post";
	/** Input validation (any object with .parse() or .safeParse()) */
	input?: {
		parse?: (data: unknown) => T;
		safeParse?: (data: unknown) => { success: boolean; data: T };
	};
	/** Action resolver */
	resolver: ActionResolver<T>;
}

/** Actions configuration map */
export type ActionsConfig = Record<string, ActionConfig>;

/** Extract the return type of a loader function */
export type LoaderReturnType<T extends LoaderFn> = Awaited<ReturnType<T>>;
