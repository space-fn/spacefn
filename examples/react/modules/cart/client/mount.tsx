import { createRoot } from "react-dom/client";

import { mountIsland } from "#lib/ui/mount.ts";

import type { Product } from "../cart.ts";
import { Cart } from "./Cart.tsx";

/** Starts the cart in the element the page rendered with `island("cart", ...)`. */
export const mountCart = () =>
	mountIsland<{ products: readonly Product[] }>("cart", (element, props) =>
		createRoot(element).render(<Cart products={props.products} />),
	);
