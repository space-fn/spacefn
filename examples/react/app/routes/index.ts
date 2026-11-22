import { Effect } from "effect";
import { page } from "spacefn";

import { layout } from "#lib/ui/layout.ts";
import * as Shop from "#modules/shop/shop.ts";
import { shopPage } from "#modules/shop/views.ts";

// The shop at /: the page with the cart, so the only one that loads its script.
export default page({
	loader: Effect.all({ title: Shop.title, products: Shop.products }),
	render: (ctx) => layout(ctx.data.title, shopPage(ctx.data)),
});
