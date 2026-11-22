import { Effect } from "effect";
import { action, page, redirect } from "spacefn";

import { layout } from "#lib/ui/layout.ts";
import * as Catalog from "#modules/catalog/catalog.ts";
import { storefront } from "#modules/catalog/views.ts";
import * as Shops from "#modules/shops/shops.ts";

// A shop's storefront at /s/:shop: its products come from its own database.
export default page({
	loader: Effect.all({ shop: Shops.current, products: Catalog.products }),
	actions: {
		add: action({
			input: Catalog.NewProduct,
			handler: (product) => Effect.andThen(Catalog.add(product), Effect.map(Shops.here, redirect)),
		}),
		sell: action({
			input: Catalog.ProductRef,
			handler: (product) => Effect.andThen(Catalog.sell(product), Effect.map(Shops.here, redirect)),
		}),
	},
	render: (ctx) =>
		layout(
			ctx.data.shop.name,
			storefront({
				name: ctx.data.shop.name,
				products: ctx.data.products,
				add: ctx.actions.add.url,
				sell: ctx.actions.sell.url,
			}),
		),
});
