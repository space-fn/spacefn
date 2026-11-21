import { Effect, Schema } from "effect";
import { action, Input, page, redirect } from "spacefn";

import { layout } from "#lib/ui/layout.ts";
import * as Catalog from "#modules/catalog/catalog.ts";
import { storefront } from "#modules/catalog/views.ts";
import * as Shops from "#modules/shops/shops.ts";

// A shop's storefront at /s/:shop: its products come from its own database.

const here = Effect.map(
	Input.params(Schema.Struct({ shop: Schema.String })),
	({ shop }) => `/s/${shop}`,
);

export default page({
	loader: Effect.gen(function* () {
		const { shop } = yield* Input.params(Schema.Struct({ shop: Schema.String }));
		return { name: (yield* Shops.find(shop)).name, products: yield* Catalog.products };
	}),
	actions: {
		add: action({
			input: Catalog.NewProduct,
			handler: (product) => Effect.andThen(Catalog.add(product), Effect.map(here, redirect)),
		}),
		sell: action({
			input: Catalog.ProductRef,
			handler: (product) => Effect.andThen(Catalog.sell(product), Effect.map(here, redirect)),
		}),
	},
	render: (ctx) =>
		layout(
			ctx.data.name,
			storefront({
				name: ctx.data.name,
				products: ctx.data.products,
				add: ctx.actions.add.url,
				sell: ctx.actions.sell.url,
			}),
		),
});
