import { describe, expect, it } from "@effect/vitest";

import { html } from "../src/html.ts";
import { islandsOf } from "../src/island/server.ts";
import { islands } from "../src/islands.ts";

const tags = ['<script type="module" src="/.space/islands/Cart.ts"></script>'];
const island = islandsOf((name) => (name === "Cart" ? tags : undefined));

describe("island on the server", () => {
	it("renders the element with its props, then the island's script", () => {
		expect(String(island("Cart", { items: ["mug"] }))).toBe(
			'<spacefn-island name="Cart" style="display: contents"><script type="application/json">{"items":["mug"]}</script></spacefn-island>' +
				tags[0],
		);
	});

	it("loads the script once however many it renders, and keeps props from closing the script", () => {
		const page = String(html`${island("Cart", "a")}${island("Cart", "</script><b>")}`);
		expect(page.split(tags[0]!).length).toBe(2);
		expect(page).toContain('"\\u003c/script>\\u003cb>"');
		expect(String(island("Cart"))).toContain('<script type="application/json">null</script>');
	});

	it("fails on a name that is no island", () => {
		expect(() => island("Menu")).toThrow(/no island "Menu"/);
	});

	it("tells what's missing when the Vite plugin didn't provide it", () => {
		expect(() => islands()).toThrow(/spacefn Vite plugin/);
	});
});
