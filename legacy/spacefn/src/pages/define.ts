import type { Context } from "hono";

import type { AppBindings } from "../env";
import type { Html, Raw } from "./html";

/**
 * What a page renders: `html` output, or `raw()` markup you made safe yourself.
 * A plain string is a type error, and is escaped at runtime if one slips through.
 */
export type PageOutput = Html | Raw;

/** The default export of `pages/<path>.page.ts`. Receives the loader's data as `props`. */
export type PageRender<P = unknown> = (
	props: P,
	c: Context<{ Bindings: AppBindings; Variables: Record<string, unknown> }>,
) => PageOutput | Promise<PageOutput>;

/** Loads data for a page. Return a `Response` to answer the request yourself, e.g. a redirect. */
export type PageLoader<P = unknown> = (
	c: Context<{ Bindings: AppBindings; Variables: Record<string, unknown> }>,
) => P | Response | Promise<P | Response>;

/** A form action. Return a `Response` to answer yourself; return nothing to redirect back. */
export type PageAction = (
	c: Context<{ Bindings: AppBindings; Variables: Record<string, unknown> }>,
) => unknown;

export interface ServerModule {
	loader?: PageLoader;
	actions?: Record<string, PageAction>;
}

/** Extracts the props type from a `PageLoader`, so `definePage<typeof loader>` works. */
type LoaderProps<L> = L extends PageLoader<infer R> ? Exclude<R, Response> : L;

/** Declares a page's markup. The default export of `pages/<path>.page.ts`. */
export function definePage<L extends PageLoader<any>>(
	render: PageRender<LoaderProps<L>>,
): PageRender<LoaderProps<L>>;
export function definePage<P = Record<string, never>>(render: PageRender<P>): PageRender<P>;
export function definePage(render: unknown): unknown {
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
export function defineActions<const A extends Record<string, PageAction>>(
	actions: A,
): { [K in keyof A]: A[K] & { path(): string } } {
	const result = { ...actions } as unknown as Record<string, PageAction & { path(): string }>;
	for (const name of Object.keys(actions)) {
		const fn = actions[name as keyof A];
		const path = () => `?_action=${name}`;
		(result[name] as PageAction & { path(): string }).path = path;
		// Preserve callability: copy the function.
		const wrapped = ((...args: Parameters<PageAction>) =>
			(fn as PageAction)(...args)) as PageAction & { path(): string };
		wrapped.path = path;
		result[name] = wrapped;
	}
	return result as { [K in keyof A]: A[K] & { path(): string } };
}
