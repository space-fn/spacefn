import { Effect } from "effect";
import { action, page, redirect } from "spacefn";

import { layout } from "#lib/ui/layout.ts";
import * as Shops from "#modules/shops/shops.ts";
import { shopsPage } from "#modules/shops/views.ts";

// The platform's home at /: every shop, and opening a new one.
export default page({
	loader: Effect.all({ shops: Shops.list }),
	actions: {
		create: action({
			input: Shops.NewShop,
			handler: (shop) => Effect.as(Shops.create(shop), redirect(Shops.url(shop.slug))),
		}),
	},
	render: (ctx) =>
		layout(
			"Shops",
			shopsPage({
				shops: ctx.data.shops,
				create: ctx.actions.create.url,
				invalid: ctx.actions.create.ok === false,
			}),
		),
});
