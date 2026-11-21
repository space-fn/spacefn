import { Effect } from "effect";
import { page } from "spacefn";
import { assets } from "spacefn/assets";

import Env from "#configs/env.ts";
import { layout } from "#lib/ui/layout.ts";
import { PRODUCTS } from "#modules/cart/cart.ts";
import { shopPage } from "#modules/cart/views.ts";

// The shop at /: the page with the cart, so the only one that loads its entry.
export default page({
	loader: Effect.gen(function* () {
		return { title: (yield* Env).SHOP_NAME, products: PRODUCTS };
	}),
	render: (ctx) => layout(ctx.data.title, shopPage(ctx.data), assets("cart")),
});
