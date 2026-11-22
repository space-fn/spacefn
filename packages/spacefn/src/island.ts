/**
 * A client component on a server-rendered page, declared once in a
 * `*.island.ts` / `*.island.tsx` file and used on both sides:
 *
 * ```tsx
 * // modules/cart/ui/cart.island.tsx
 * import { createRoot } from "react-dom/client";
 * import { island } from "spacefn/island";
 *
 * export const CartIsland = island("cart", (element, props: { products: Product[] }) => {
 *   const root = createRoot(element);
 *   root.render(<Cart {...props} />);
 *   return () => root.unmount();
 * });
 *
 * // a page
 * html`<main>${CartIsland.render({ products })}</main>`;
 * ```
 *
 * On the server, `render` writes the element the component starts in, its
 * props as JSON, and the file's `<script>` (once per response). In the
 * browser, the file starts the component in each of those elements, also ones
 * added later, and calls what `start` returns when one is removed.
 *
 * The spacefn Vite plugin (`configs/vite.ts`) gives each island file its own
 * copy of this module, so this one only runs when the plugin is missing or the
 * file isn't named `*.island.*`.
 */
import type { Html } from "./html.ts";

/** Starts the component in `element` with the props `render` was given; may return how to stop it. */
export type IslandStart<P> = (element: HTMLElement, props: P) => void | (() => void);

export interface Island<P> {
	/** The `name` of its `<spacefn-island>` elements; unique in the app. */
	readonly name: string;
	/** On the server: the element, its props and the file's `<script>`. Props must survive JSON. */
	readonly render: (props: P) => Html;
}

export const island = <P = undefined>(_name: string, _start: IslandStart<P>): Island<P> => {
	throw new Error(
		'spacefn/island is provided by the spacefn Vite plugin, in files named *.island.ts or *.island.tsx: add plugins: [space(...)] from "spacefn/vite" to the Vite config, or rename the file',
	);
};
