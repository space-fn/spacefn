import { mount } from "svelte";

import { mountIsland } from "#lib/ui/mount.ts";

import type { Product } from "../cart.ts";
import Cart from "./Cart.svelte";

/** Starts the cart in the element the page rendered with `island("cart", ...)`. */
export const mountCart = () =>
	mountIsland<{ products: readonly Product[] }>("cart", (target, props) =>
		mount(Cart, { target, props }),
	);
