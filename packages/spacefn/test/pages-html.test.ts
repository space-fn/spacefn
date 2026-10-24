import { expect, test } from "vite-plus/test";

import { css, escapeHtml, html, minifyHtml, raw } from "../src/pages";

test("escapes interpolated text", () => {
	const name = `<script>alert("x")</script> & 'friends'`;
	expect(String(html`<p>${name}</p>`)).toBe(
		"<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;friends&#39;</p>",
	);
});

test("escapes attribute values too", () => {
	const value = `" onmouseover="steal()`;
	expect(String(html`<a href="/x?q=${value}"></a>`)).toContain("&quot; onmouseover=&quot;steal()");
});

test("raw passes markup through unchanged", () => {
	expect(String(html`<div>${raw("<b>bold</b>")}</div>`)).toBe("<div><b>bold</b></div>");
});

test("nested templates are not escaped twice", () => {
	const inner = html`<i>${"a<b"}</i>`;
	expect(String(html`<p>${inner}</p>`)).toBe("<p><i>a&lt;b</i></p>");
});

test("arrays are joined and empty values render nothing", () => {
	const items = ["one", "two"].map((item) => html`<li>${item}</li>`);
	const out = String(
		html`<ul>
			${items}
		</ul>`,
	).replace(/\s+/g, "");
	expect(out).toBe("<ul><li>one</li><li>two</li></ul>");
	expect(String(html`<p>${null}${undefined}${false}</p>`).replace(/\s+/g, "")).toBe("<p></p>");
});

test("numbers render as text", () => {
	expect(String(html`<span>${0}</span>`)).toBe("<span>0</span>");
});

test("escapeHtml escapes the five characters that matter", () => {
	expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
});

test("minifyHtml collapses whitespace between tags", () => {
	const out = minifyHtml(
		html`<div>
			<p>hello</p>
			<p>world</p>
		</div>`,
	);
	expect(out).toBe("<div><p>hello</p><p>world</p></div>");
});

test("minifyHtml preserves pre content", () => {
	const out = minifyHtml(html`<pre>  keep   spaces  </pre>`);
	expect(out).toContain("  keep   spaces  ");
});

test("css tagged template splices values", () => {
	const color = "red";
	expect(css`.box { color: ${color}; }`).toBe(".box { color: red; }");
});

test("css escapes style breakout", () => {
	const evil = "</style><script>alert(1)</script>";
	const out = css`
		${evil}
	`;
	expect(out).not.toContain("</style><script>");
});
