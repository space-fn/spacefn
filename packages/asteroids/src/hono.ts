// --- @spacefn/asteroids/hono -------------------------------------------------
// Hono utilities ported from gotwo

import { type HtmlElement, renderElement } from "@spacefn/html";
import type { Context } from "hono";

export function defineRoute(handler: (c: Context) => Response | Promise<Response>) {
	return handler;
}

export function defineLoader<T>(loader: (c: Context) => T | Promise<T>) {
	return loader;
}

export type ActionResolver = (c: Context) => Response | Promise<Response>;

export interface Action {
	method: string;
	resolver: ActionResolver;
}

export type ActionEntry = Action & { path: string };

export function defineActions<T extends Record<string, Action>>(actions: T) {
	return Object.fromEntries(
		Object.entries(actions).map(([name, action]) => [
			name,
			{ ...action, path: `?_action=${name}` },
		]),
	) as Record<string, ActionEntry>;
}

type InferLoaderData<T> = T extends (c: any) => infer R
	? R extends Promise<infer D>
		? D
		: R
	: never;

export function definePage<T>(component: (data: InferLoaderData<T>) => any) {
	return component;
}

export function html(el: HtmlElement) {
	return new Response(renderElement(el), {
		headers: { "Content-Type": "text/html" },
	});
}
