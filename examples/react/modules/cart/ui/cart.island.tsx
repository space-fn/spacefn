import { createRoot } from "react-dom/client";
import { island } from "spacefn/island";

import type { Product } from "../cart.ts";
import { Cart } from "./Cart.tsx";

// The cart, which React renders in the browser. A page shows it with CartIsland.render(...).
export const CartIsland = island("cart", (element, props: { products: readonly Product[] }) => {
	const root = createRoot(element);
	root.render(<Cart products={props.products} />);
	return () => root.unmount();
});
