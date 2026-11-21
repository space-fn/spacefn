import { useState } from "react";

import { formatPrice, type Product } from "../cart.ts";

/** The cart: add products, see the total. Its state lives in the browser. */
export function Cart({ products }: { readonly products: readonly Product[] }) {
	const [counts, setCounts] = useState<Readonly<Record<string, number>>>({});
	const total = products.reduce(
		(sum, product) => sum + product.price * (counts[product.id] ?? 0),
		0,
	);
	return (
		<div className="cart">
			<ul>
				{products.map((product) => (
					<li key={product.id}>
						<span>{product.name}</span>{" "}
						<button
							type="button"
							onClick={() => setCounts((c) => ({ ...c, [product.id]: (c[product.id] ?? 0) + 1 }))}
						>
							Add
						</button>{" "}
						<output>{counts[product.id] ?? 0}</output>
					</li>
				))}
			</ul>
			<p>Total: {formatPrice(total)}</p>
		</div>
	);
}
