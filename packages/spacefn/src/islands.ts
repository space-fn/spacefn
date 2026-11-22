/**
 * Client components on server-rendered pages. A file named `*.island.*` is
 * an island: its default export is the component, and its name is the file's
 * (`Cart.island.tsx` is `Cart`). Codegen writes `.space/islands.ts`, which
 * the app imports for `island(...)`:
 *
 * ```ts
 * import { island } from "#space/islands.ts";
 *
 * html`<main>${island("Cart", { products })}</main>`;
 * ```
 *
 * On the server, `island` writes the element the component starts in, its
 * props as JSON, and the island's `<script>`, once per response. In the
 * browser, `.space/islands/<Name>.ts` starts the component in each of those
 * elements, also ones added later, and stops it when one is removed.
 *
 * The framework comes from the file: `.vue` is Vue, `.svelte` is Svelte,
 * `.tsx` / `.jsx` is React or Solid (whichever `package.json` has), and
 * `.ts` / `.js` exports an {@link IslandStart} that starts it by hand.
 *
 * The spacefn Vite plugin (`configs/vite.ts`) provides this module, so this
 * file only runs when the plugin is missing.
 */
import type { Html } from "./html.ts";

/** Starts the component in `element` with the props it was given; may return how to stop it. */
export type IslandStart<P = any> = (element: HTMLElement, props: P) => void | (() => void);

/** A React or Solid component's props. */
export type FunctionProps<C> = C extends (props: infer P, ...rest: any) => any
	? P
	: C extends new (props: infer P, ...rest: any) => any
		? P
		: {};

/** A Vue component's props. */
export type VueProps<C> = C extends new (...args: any) => { $props: infer P } ? P : {};

/** A Svelte component's props. */
export type SvelteProps<C> = C extends (internals: any, props: infer P) => any ? P : {};

/** The props of an {@link IslandStart}. */
export type StartProps<C> = C extends (element: any, props: infer P) => any ? P : {};

/** `island(name, props)`: props may be left out when the component needs none. */
export type IslandRender<Islands> = <Name extends Extract<keyof Islands, string>>(
	name: Name,
	...props: {} extends Islands[Name] ? [props?: Islands[Name]] : [props: Islands[Name]]
) => Html;

export const islands = <Islands>(): IslandRender<Islands> => {
	throw new Error(
		'spacefn/islands is provided by the spacefn Vite plugin: add plugins: [space(...)] from "spacefn/vite" to the Vite config',
	);
};
