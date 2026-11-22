import { Effect } from "effect";

import Env from "#configs/env.ts";

import { PRODUCTS } from "./products.ts";

/** The shop's name, from configs/env.ts. */
export const title = Effect.gen(function* () {
	return (yield* Env).SHOP_NAME;
});

/** What the shop sells. An app would read it from a database; the example keeps it in code. */
export const products = Effect.succeed(PRODUCTS);
