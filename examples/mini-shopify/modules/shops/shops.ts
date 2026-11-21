import { Effect, LayerMap, Option, Schema } from "effect";
import { Conflict, NotFound } from "spacefn";

import PlatformDb from "#space/db/platform.ts";
import ShopDb from "#space/db/shop.ts";

import { DatabaseHost } from "./host.ts";

/** A shop's address, `/s/<slug>/`, and its database's name. */
export const Slug = Schema.String.pipe(Schema.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{1,30}$/)));

export const NewShop = Schema.Struct({ slug: Slug, name: Schema.NonEmptyString });

export const list = PlatformDb.listShops();

/** Creates the shop's own database, then records where it is. */
export const create = ({ slug, name }: typeof NewShop.Type) =>
	Effect.gen(function* () {
		if (Option.isSome(yield* PlatformDb.findShop({ slug })))
			return yield* new Conflict({ message: `There's a shop at ${slug} already` });
		const url = yield* (yield* DatabaseHost).create(`shop-${slug}`);
		yield* PlatformDb.addShop({ slug, name, url });
	});

export const find = (slug: string) =>
	Effect.flatMap(PlatformDb.findShop({ slug }), (shop) =>
		Option.isSome(shop)
			? Effect.succeed(shop.value)
			: Effect.fail(new NotFound({ message: `No shop ${slug}` })),
	);

/**
 * Each shop's `ShopDb`, by slug: opened, and migrated, the first time a
 * request needs it, and closed after a minute without one. Provide it to a
 * request with `Effect.provide(Shops.get(slug))`.
 */
export class Shops extends LayerMap.Service<Shops>()("mini-shopify/Shops", {
	lookup: (slug: string) =>
		ShopDb.layer(
			Effect.gen(function* () {
				const shop = yield* find(slug);
				return yield* (yield* DatabaseHost).open(shop.url);
			}),
		),
	idleTimeToLive: "1 minute",
}) {}
