import { Schema } from "effect";

import ShopDb from "#space/db/shop.ts";

// Runs on the current shop's database: the request's ShopDb, which the
// middleware of /s/:shop/ provides.

export const NewProduct = Schema.Struct({
	name: Schema.NonEmptyString,
	/** In dollars, as the form sends it. */
	price: Schema.FiniteFromString,
	stock: Schema.FiniteFromString,
});

export const ProductRef = Schema.Struct({ id: Schema.FiniteFromString });

export const products = ShopDb.listProducts();

export const add = ({ name, price, stock }: typeof NewProduct.Type) =>
	ShopDb.addProduct({
		name,
		price: Math.round(price * 100),
		stock: Math.max(0, Math.trunc(stock)),
	});

/** One sold: one fewer in stock, if there's one left. */
export const sell = ({ id }: typeof ProductRef.Type) => ShopDb.sellProduct({ id });

export const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;
