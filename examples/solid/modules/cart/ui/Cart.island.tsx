import { createSignal, For } from "solid-js";

import { formatPrice, type Product } from "../cart.ts";

/** The cart: add products, see the total. Its state lives in the browser. */
export default function Cart(props: { readonly products: readonly Product[] }) {
	const [counts, setCounts] = createSignal<Readonly<Record<string, number>>>({});
	const total = () =>
		props.products.reduce((sum, product) => sum + product.price * (counts()[product.id] ?? 0), 0);
	return (
		<div class="cart">
			<ul>
				<For each={props.products}>
					{(product) => (
						<li>
							<span>{product.name}</span>{" "}
							<button
								type="button"
								onClick={() => setCounts((c) => ({ ...c, [product.id]: (c[product.id] ?? 0) + 1 }))}
							>
								Add
							</button>{" "}
							<output>{counts()[product.id] ?? 0}</output>
						</li>
					)}
				</For>
			</ul>
			<p>Total: {formatPrice(total())}</p>
		</div>
	);
}
