import { island } from "spacefn/island";
import { mount, unmount } from "svelte";

import type { Product } from "../cart.ts";
import Cart from "./Cart.svelte";

// The cart, which Svelte renders in the browser. A page shows it with CartIsland.render(...).
export const CartIsland = island("cart", (target, props: { products: readonly Product[] }) => {
	const cart = mount(Cart, { target, props });
	return () => void unmount(cart);
});
