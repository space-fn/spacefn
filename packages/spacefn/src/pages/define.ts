import type { Context } from "hono";

import type { Html } from "./html";

export type PageOutput = Html | string;

/** The default export of `pages/<path>.page.ts`. Receives the loader's data as `props`. */
export type PageRender<P = unknown> = (props: P, c: Context) => PageOutput | Promise<PageOutput>;

/** Loads data for a page. Return a `Response` to answer the request yourself, e.g. a redirect. */
export type PageLoader<P = unknown> = (c: Context) => P | Response | Promise<P | Response>;

/** A form action. Return a `Response` to answer yourself; return nothing to redirect back. */
export type PageAction = (c: Context) => unknown;

export interface ServerModule {
	loader?: PageLoader;
	actions?: Record<string, PageAction>;
}

/** Declares a page's markup. The default export of `pages/<path>.page.ts`. */
export function definePage<P = Record<string, never>>(render: PageRender<P>): PageRender<P> {
	return render;
}

/** Declares a page's data. Export it as `loader` from `pages/<path>.server.ts`. */
export function defineLoader<P>(load: PageLoader<P>): PageLoader<P> {
	return load;
}

/**
 * Declares a page's form actions. Export it as `actions` from `pages/<path>.server.ts`.
 * A form selects one with `?_action=<name>` on a POST to the page.
 */
export function defineActions<const A extends Record<string, PageAction>>(actions: A): A {
	return actions;
}
