import { Layer } from "effect";
import { memoryServices, testApp, testEnv } from "spacefn/testing";
import { describe, expect, it } from "vitest";

import Env from "#configs/env.ts";
import { manifest } from "#space/manifest.ts";

const app = () =>
	testApp(manifest, Layer.mergeAll(memoryServices, Env.layer.pipe(Layer.provide(testEnv({})))));

describe("the shop", () => {
	it("renders the cart's island with its props, and loads its script once", async () => {
		await using shop = app();
		const page = await (await shop.fetch("/")).text();
		expect(page).toMatch(
			/<spacefn-island name="cart"[^>]*><script type="application\/json">\{"products":\[\{"id":"mug"/,
		);
		const script = '<script type="module" src="/modules/cart/ui/cart.island.ts"></script>';
		expect(page.split(script).length).toBe(2);
	});

	it("doesn't load the cart on a page without it", async () => {
		await using shop = app();
		const page = await (await shop.fetch("/about")).text();
		expect(page).toContain('<link rel="stylesheet" href="/app/assets/site.css">');
		expect(page).not.toContain("cart.island");
	});
});
