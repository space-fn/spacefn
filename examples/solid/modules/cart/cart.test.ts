import { Layer } from "effect";
import { memoryServices, testApp, testEnv } from "spacefn/testing";
import { describe, expect, it } from "vitest";

import Env from "#configs/env.ts";
import { manifest } from "#space/manifest.ts";

const app = () =>
	testApp(manifest, Layer.mergeAll(memoryServices, Env.layer.pipe(Layer.provide(testEnv({})))));

describe("the shop", () => {
	it("renders the cart's island with its props, and loads its entry", async () => {
		await using shop = app();
		const page = await (await shop.fetch("/")).text();
		expect(page).toContain('<div id="cart"></div>');
		expect(page).toMatch(
			/<script type="application\/json" id="cart-props">\s*\{"products":\[\{"id":"mug"/,
		);
		expect(page).toContain('<script type="module" src="/app/client/cart.tsx"></script>');
	});

	it("doesn't load the cart on a page without it", async () => {
		await using shop = app();
		const page = await (await shop.fetch("/about")).text();
		expect(page).toContain('<link rel="stylesheet" href="/app/client/site.css">');
		expect(page).not.toContain("/app/client/cart");
	});
});
