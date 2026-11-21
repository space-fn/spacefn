import { Effect, Schema } from "effect";
import { Input, middleware } from "spacefn";

import { Shops } from "#modules/shops/shops.ts";

// Every page under /s/:shop/ runs on that shop's own database.
export default middleware((next) =>
	Effect.gen(function* () {
		const { shop } = yield* Input.params(Schema.Struct({ shop: Schema.String }));
		return yield* Effect.provide(next, Shops.get(shop));
	}),
);
