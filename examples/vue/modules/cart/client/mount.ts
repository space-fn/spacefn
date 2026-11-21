import { createApp } from "vue";

import { mountIsland } from "#lib/ui/mount.ts";

import type { Product } from "../cart.ts";
import Cart from "./Cart.vue";

/** Starts the cart in the element the page rendered with `island("cart", ...)`. */
export const mountCart = () =>
	mountIsland<{ products: readonly Product[] }>("cart", (element, props) =>
		createApp(Cart, props).mount(element),
	);
