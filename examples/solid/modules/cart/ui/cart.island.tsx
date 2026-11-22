import { render } from "solid-js/web";
import { island } from "spacefn/island";

import type { Product } from "../cart.ts";
import { Cart } from "./Cart.tsx";

// The cart, which Solid renders in the browser. A page shows it with CartIsland.render(...).
export const CartIsland = island("cart", (element, props: { products: readonly Product[] }) =>
	render(() => <Cart products={props.products} />, element),
);
