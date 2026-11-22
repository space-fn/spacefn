// Shared by the server, which renders the page, and the browser, which runs the cart:
// so this file imports nothing server-only.

export interface Product {
	readonly id: string;
	readonly name: string;
	/** In cents. */
	readonly price: number;
}

/** What the shop sells. */
export const PRODUCTS: readonly Product[] = [
	{ id: "mug", name: "Mug", price: 1200 },
	{ id: "shirt", name: "T-shirt", price: 2500 },
	{ id: "sticker", name: "Sticker", price: 300 },
];

export const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;
