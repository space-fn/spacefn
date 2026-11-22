# mini-shopify

Shops that each get their own database, on Bun. The platform keeps one database of shops (`app/db/platform/`); every shop's products are in a database of its own, made from the schema in `app/db/shop/`, on [Turso](https://turso.tech) or as local files.

```sh
pnpm dev    # shops' databases in .space/data/shops/
pnpm test
```

With `TURSO_ORG`, `TURSO_API_TOKEN` and `TURSO_GROUP_TOKEN` set (see `.env.example`), opening a shop creates its database in your Turso group with the [Platform API](https://docs.turso.tech/api-reference), through `@tursodatabase/api`.

How it fits together:

- **Two databases, one per kind.** `app/db/platform/` is opened at startup like any other. `app/db/shop/` has `"open": "manual"` in its `config.json`: a schema only, which `databases(manifest)` and the infra leave alone, and whose `ShopDb` queries run on whichever shop's database the request has.
- **Creating a shop** (`modules/shops/shops.ts`): `DatabaseHost.create` makes the database (`modules/shops/host.ts`, Turso or local files), and the platform database records its URL. Turso's are opened with `libsql` from `spacefn/libsql`, over HTTP, which also runs on Cloudflare; local files need the native client from `spacefn/bun`. One group token opens every shop's database, so no secret is stored per shop.
- **Opening it per request**: `Shops` is an Effect `LayerMap` from a slug to that shop's `ShopDb` layer. It opens the database and applies the migrations the first time a request needs it, and closes it after a minute without one. `app/routes/s/[shop]/_middleware.ts` provides `Shops.get(shop)` to everything under `/s/:shop/`, so the pages there just use `ShopDb`.
- **Tests** give each run a fresh folder of local databases (`modules/shops/shops.test.ts`), and check that one shop's products don't show in another.

`app/` only wires: the pages and the middleware connect `modules/shops/` and `modules/catalog/`.
