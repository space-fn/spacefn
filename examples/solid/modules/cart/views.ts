import { html } from "spacefn";

import { island } from "#lib/ui/island.ts";

import type { Product } from "./cart.ts";

/** The shop's page: server-rendered, with the Solid cart as an island. */
export const shopPage = (props: {
	readonly title: string;
	readonly products: readonly Product[];
}) =>
	html`<main>
		<h1>${props.title}</h1>
		${island("cart", { products: props.products })}
		<noscript>The cart needs JavaScript.</noscript>
	</main>`;

export const aboutPage = () =>
	html`<main>
		<h1>About</h1>
		<p>This page is plain server-rendered HTML: it loads the site's styles, and not the cart.</p>
	</main>`;
