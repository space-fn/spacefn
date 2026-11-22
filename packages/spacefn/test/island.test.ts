import { describe, expect, it } from "@effect/vitest";

import { html } from "../src/html.ts";
import { island } from "../src/island.ts";
import { serverIsland } from "../src/island/server.ts";

const tags = ['<script type="module" src="/modules/cart/cart.island.tsx"></script>'];

describe("island on the server", () => {
	it("renders the element with its props, then the file's script", () => {
		const Cart = serverIsland(tags)("cart", (_element, _props: { items: string[] }) => {});
		expect(Cart.name).toBe("cart");
		expect(String(Cart.render({ items: ["mug"] }))).toBe(
			'<spacefn-island name="cart" style="display: contents"><script type="application/json">{"items":["mug"]}</script></spacefn-island>' +
				tags[0],
		);
	});

	it("loads the file once however many it renders, and keeps props from closing the script", () => {
		const Cart = serverIsland(tags)("cart", (_element, _props: string) => {});
		const page = String(html`${Cart.render("a")}${Cart.render("</script><b>")}`);
		expect(page.split(tags[0]!).length).toBe(2);
		expect(page).toContain('"\\u003c/script>\\u003cb>"');
	});

	it("tells what's missing when the Vite plugin didn't provide it", () => {
		expect(() => island("cart", () => {})).toThrow(/spacefn Vite plugin.*\*\.island\.ts/);
	});
});
