import { island } from "spacefn/island";
import { createApp } from "vue";

import type { Product } from "../cart.ts";
import Cart from "./Cart.vue";

// The cart, which Vue renders in the browser. A page shows it with CartIsland.render(...).
export const CartIsland = island("cart", (element, props: { products: readonly Product[] }) => {
	const app = createApp(Cart, props);
	app.mount(element);
	return () => app.unmount();
});
