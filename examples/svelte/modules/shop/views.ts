import { html } from "spacefn";

import { island } from "#space/islands.ts";

import type { Product } from "./products.ts";

/** The shop's page: server-rendered, with the Svelte cart as an island. */
export const shopPage = (props: {
	readonly title: string;
	readonly products: readonly Product[];
}) =>
	html`<main>
		<h1>${props.title}</h1>
		${island("Cart", { products: props.products })}
		<noscript>The cart needs JavaScript.</noscript>
	</main>`;
