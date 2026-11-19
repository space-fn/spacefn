import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { escapeHtml, html, raw } from "../src/html.ts";
import { route } from "../src/http/route.ts";
import { testHttp } from "../src/testing.ts";

describe("html", () => {
	it("escapes interpolated text and attribute values", () => {
		const name = `<script>alert("x")</script> & 'friends'`;
		expect(String(html`<p>${name}</p>`)).toBe(
			"<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;friends&#39;</p>",
		);
		const value = `" onmouseover="steal()`;
		expect(String(html`<a href="/x?q=${value}"></a>`)).toContain(
			"&quot; onmouseover=&quot;steal()",
		);
	});

	it("passes raw() and nested templates through once", () => {
		expect(String(html`<div>${raw("<b>bold</b>")}</div>`)).toBe("<div><b>bold</b></div>");
		const inner = html`<i>${"a<b"}</i>`;
		expect(String(html`<p>${inner}</p>`)).toBe("<p><i>a&lt;b</i></p>");
	});

	it("joins arrays, renders numbers and drops empty values", () => {
		const items = ["one", "two"].map((item) => html`<li>${item}</li>`);
		// The formatter may reflow templates, so compare without whitespace.
		const list = String(
			html`<ul>
				${items}
			</ul>`,
		).replace(/\s+/g, "");
		expect(list).toBe("<ul><li>one</li><li>two</li></ul>");
		expect(String(html`<p>${null}${undefined}${false}${0}</p>`)).toBe("<p>0</p>");
	});

	it("escapes the five characters that matter", () => {
		expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
	});

	it("is served as text/html from a route", async () => {
		const app = testHttp({
			routes: [
				{
					kind: "route",
					path: "/hi",
					params: [],
					file: "app/routes/hi.ts",
					module: { default: route({ GET: Effect.succeed(html`<p>${"hi"}</p>`) }) },
				},
			],
		});
		const response = await app.fetch("/hi");
		expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(await response.text()).toBe("<p>hi</p>");
		await app.dispose();
	});
});
