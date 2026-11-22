import { Effect, LayerMap, Option, Schema } from "effect";
import { Conflict, Input, NotFound, type HttpApp } from "spacefn";

import PlatformDb, { type ListShopsRow } from "#space/db/platform.ts";
import ShopDb from "#space/db/shop.ts";

import { DatabaseHost } from "./host.ts";

/** A shop's address, `/s/<slug>/`, and its database's name. */
export const Slug = Schema.String.pipe(Schema.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{1,30}$/)));

export type Shop = ListShopsRow;

export const NewShop = Schema.Struct({ slug: Slug, name: Schema.NonEmptyString });

/** The path parameters of `/s/:shop/`. */
export const Params = Schema.Struct({ shop: Slug });

/** A shop's storefront. */
export const url = (slug: string) => `/s/${slug}`;

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
 * request with {@link provideShopDb}.
 */
export class ShopDatabases extends LayerMap.Service<ShopDatabases>()("mini-shopify/ShopDatabases", {
	lookup: (slug: string) =>
		ShopDb.layer(
			Effect.gen(function* () {
				const shop = yield* find(slug);
				return yield* (yield* DatabaseHost).open(shop.url);
			}),
		),
	idleTimeToLive: "1 minute",
}) {}

/** The shop the request is under, `/s/:shop/`. */
export const current = Effect.flatMap(Input.params(Params), ({ shop }) => find(shop));

/** The storefront the request is under. */
export const here = Effect.map(Input.params(Params), ({ shop }) => url(shop));

/** Runs `next` on the database of the shop the request is under. */
export const provideShopDb = (next: HttpApp) =>
	Effect.flatMap(Input.params(Params), ({ shop }) => Effect.provide(next, ShopDatabases.get(shop)));
