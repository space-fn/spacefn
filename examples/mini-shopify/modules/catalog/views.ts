import { html } from "spacefn";

import { formatPrice, type Product } from "./catalog.ts";

/** A shop's storefront: its products, each with a button to sell one, and a form to add one. */
export const storefront = (props: {
	readonly name: string;
	readonly products: readonly Product[];
	readonly add: string;
	readonly sell: string;
}) =>
	html`<main>
		<p><a href="/">All shops</a></p>
		<h1>${props.name}</h1>
		<table>
			<tbody>
				${props.products.map(
					(product) =>
						html`<tr>
							<td>${product.name}</td>
							<td>${formatPrice(product.price)}</td>
							<td>${product.stock} left</td>
							<td>
								<form method="post" action="${props.sell}">
									<input type="hidden" name="id" value="${product.id}" />
									<button ${product.stock === 0 ? "disabled" : ""}>Sell one</button>
								</form>
							</td>
						</tr>`,
				)}
			</tbody>
		</table>
		<form method="post" action="${props.add}">
			<input name="name" placeholder="Product" required />
			<input name="price" placeholder="Price" inputmode="decimal" required />
			<input name="stock" placeholder="Stock" inputmode="numeric" value="1" />
			<button>Add</button>
		</form>
	</main>`;
