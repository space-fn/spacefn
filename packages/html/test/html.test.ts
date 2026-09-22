import { describe, it, expect } from "vitest";

import {
	div,
	span,
	p,
	h1,
	img,
	br,
	hr,
	input,
	button,
	table,
	tr,
	td,
	thead,
	tbody,
	ul,
	li,
	form,
	label,
	section,
	article,
	header,
	footer,
	renderElement,
	raw,
	h,
	defineComponent,
	renderComponent,
} from "../src/index.js";

// ─── Basic Rendering ──────────────────────────────────────────────────────────

describe("basic rendering", () => {
	it("renders empty element", () => {
		expect(renderElement(div(null))).toBe("<div></div>");
	});

	it("renders text child", () => {
		expect(renderElement(div(null, "hello"))).toBe("<div>hello</div>");
	});

	it("renders multiple children", () => {
		expect(renderElement(div(null, "a", "b", "c"))).toBe("<div>abc</div>");
	});

	it("renders nested elements", () => {
		expect(renderElement(div(null, span(null, "inner")))).toBe("<div><span>inner</span></div>");
	});

	it("renders number children", () => {
		expect(renderElement(div(null, 42))).toBe("<div>42</div>");
	});

	it("skips null children", () => {
		expect(renderElement(div(null, "a", null, "b"))).toBe("<div>ab</div>");
	});

	it("skips undefined children", () => {
		expect(renderElement(div(null, "a", undefined, "b"))).toBe("<div>ab</div>");
	});

	it("skips false children", () => {
		expect(renderElement(div(null, "a", false, "b"))).toBe("<div>ab</div>");
	});

	it("skips true children", () => {
		expect(renderElement(div(null, "a", true, "b"))).toBe("<div>ab</div>");
	});
});

// ─── Attributes ───────────────────────────────────────────────────────────────

describe("attributes", () => {
	it("renders string attribute", () => {
		expect(renderElement(div({ class: "foo" }))).toBe('<div class="foo"></div>');
	});

	it("renders number attribute", () => {
		expect(renderElement(input({ type: "text", maxlength: 10 }))).toBe(
			'<input type="text" maxlength="10">',
		);
	});

	it("renders boolean true as bare attribute", () => {
		expect(renderElement(input({ type: "checkbox", checked: true }))).toBe(
			'<input type="checkbox" checked>',
		);
	});

	it("skips boolean false", () => {
		expect(renderElement(input({ type: "checkbox", checked: false }))).toBe(
			'<input type="checkbox">',
		);
	});

	it("skips null attribute values", () => {
		expect(renderElement(div({ class: null, id: "test" }))).toBe('<div id="test"></div>');
	});

	it("skips undefined attribute values", () => {
		expect(renderElement(div({ class: undefined, id: "test" }))).toBe('<div id="test"></div>');
	});

	it("escapes attribute values", () => {
		expect(renderElement(div({ title: 'a "b" & <c>' }))).toBe(
			'<div title="a &quot;b&quot; &amp; &lt;c&gt;"></div>',
		);
	});
});

// ─── HTML Escaping ────────────────────────────────────────────────────────────

describe("HTML escaping", () => {
	it("escapes ampersand", () => {
		expect(renderElement(p(null, "a & b"))).toBe("<p>a &amp; b</p>");
	});

	it("escapes angle brackets", () => {
		expect(renderElement(p(null, "<script>"))).toBe("<p>&lt;script&gt;</p>");
	});

	it("does not escape in raw()", () => {
		expect(renderElement(raw("<b>bold</b>"))).toBe("<b>bold</b>");
	});
});

// ─── Void Elements ────────────────────────────────────────────────────────────

describe("void elements", () => {
	it("renders <br> without closing tag", () => {
		expect(renderElement(br(null))).toBe("<br>");
	});

	it("renders <hr> without closing tag", () => {
		expect(renderElement(hr(null))).toBe("<hr>");
	});

	it("renders <input> without closing tag", () => {
		expect(renderElement(input({ type: "text" }))).toBe('<input type="text">');
	});

	it("renders <img> with alt", () => {
		expect(renderElement(img({ src: "/pic.jpg", alt: "Photo" }))).toBe(
			'<img src="/pic.jpg" alt="Photo">',
		);
	});
});

// ─── Component System ─────────────────────────────────────────────────────────

describe("defineComponent", () => {
	it("renders component with props", () => {
		const greeting = defineComponent<{ name: string }>((props) => h1(null, `Hello, ${props.name}`));

		expect(renderElement(greeting({ name: "World" }))).toBe("<h1>Hello, World</h1>");
	});

	it("renders component with slots", () => {
		type CardSlots = { default: import("../src/index.js").HtmlElement };
		const card = defineComponent<Record<string, never>, CardSlots>((_props, slots) =>
			div({ class: "card" }, slots.default),
		);

		const el = card({}, { default: p(null, "Content") });
		expect(renderElement(el)).toBe('<div class="card"><p>Content</p></div>');
	});

	it("renders nested components", () => {
		const inner = defineComponent<{ text: string }>((props) => span(null, props.text));
		const outer = defineComponent<{ label: string }>((props) =>
			div(null, inner({ text: props.label })),
		);

		expect(renderElement(outer({ label: "test" }))).toBe("<div><span>test</span></div>");
	});
});

// ─── renderComponent ──────────────────────────────────────────────────────────

describe("renderComponent", () => {
	it("renders element to string", () => {
		const el = div({ class: "root" }, h1(null, "Title"));
		expect(renderComponent(el)).toBe('<div class="root"><h1>Title</h1></div>');
	});
});

// ─── h Convenience Export ─────────────────────────────────────────────────────

describe("h export", () => {
	it("h.div works", () => {
		expect(renderElement(h.div(null, "hello"))).toBe("<div>hello</div>");
	});

	it("h.h1 works", () => {
		expect(renderElement(h.h1(null, "title"))).toBe("<h1>title</h1>");
	});

	it("h.raw works", () => {
		expect(renderElement(h.raw("<b>ok</b>"))).toBe("<b>ok</b>");
	});
});

// ─── Design Doc Example ───────────────────────────────────────────────────────

describe("design doc example", () => {
	it("renders card component from design doc", () => {
		type CardProps = { title: string };
		type CardSlots = {
			default: import("../src/index.js").HtmlElement;
			footer: import("../src/index.js").HtmlElement;
		};
		const card = defineComponent<CardProps, CardSlots>((props, slots) =>
			h.div(
				{},
				h.div({}, h.h1({}, props.title)),
				h.div({}, slots.default),
				h.div({}, slots.footer),
			),
		);

		const result = renderComponent(
			card(
				{ title: "Post Card" },
				{
					default: h.p({}, "Card content is here"),
					footer: h.div({}, h.button({}, "Like")),
				},
			),
		);

		expect(result).toBe(
			"<div><div><h1>Post Card</h1></div>" +
				"<div><p>Card content is here</p></div>" +
				"<div><div><button>Like</button></div></div></div>",
		);
	});

	it("renders full page from design doc", () => {
		type CardProps = { title: string };
		type CardSlots = {
			default: import("../src/index.js").HtmlElement;
			footer: import("../src/index.js").HtmlElement;
		};
		const card = defineComponent<CardProps, CardSlots>((props, slots) =>
			h.div(
				{},
				h.div({}, h.h1({}, props.title)),
				h.div({}, slots.default),
				h.div({}, slots.footer),
			),
		);

		type InitialData = { cardTitle: string };
		const page = defineComponent<InitialData>((data) =>
			h.html(
				{},
				h.head({}),
				h.body(
					{},
					h.main(
						{},
						h.h1({}, "Welcome"),
						card(
							{ title: data.cardTitle },
							{
								default: h.p({}, "Card content is here"),
								footer: h.div({}, h.button({}, "Like")),
							},
						),
					),
				),
			),
		);

		const result = renderComponent(page({ cardTitle: "Post Card" }));
		expect(result).toContain("<html>");
		expect(result).toContain("<head></head>");
		expect(result).toContain("<h1>Welcome</h1>");
		expect(result).toContain("<h1>Post Card</h1>");
		expect(result).toContain("<p>Card content is here</p>");
		expect(result).toContain("<button>Like</button>");
	});
});

// ─── Complex Structures ───────────────────────────────────────────────────────

describe("complex structures", () => {
	it("renders table", () => {
		const result = renderElement(
			table(
				null,
				thead(null, tr(null, td(null, "Name"))),
				tbody(null, tr(null, td(null, "Alice"))),
			),
		);
		expect(result).toBe(
			"<table><thead><tr><td>Name</td></tr></thead><tbody><tr><td>Alice</td></tr></tbody></table>",
		);
	});

	it("renders form", () => {
		const result = renderElement(
			form(
				{ action: "/submit", method: "post" },
				label({ for: "email" }, "Email"),
				input({ type: "email", id: "email", name: "email" }),
				button({ type: "submit" }, "Send"),
			),
		);
		expect(result).toBe(
			'<form action="/submit" method="post">' +
				'<label for="email">Email</label>' +
				'<input type="email" id="email" name="email">' +
				'<button type="submit">Send</button></form>',
		);
	});

	it("renders deeply nested", () => {
		const result = renderElement(
			section(
				null,
				article(
					null,
					header(null, h1(null, "Title")),
					div(null, p(null, "Body")),
					footer(null, span(null, "Author")),
				),
			),
		);
		expect(result).toContain("<section>");
		expect(result).toContain("<article>");
		expect(result).toContain("<h1>Title</h1>");
		expect(result).toContain("<p>Body</p>");
		expect(result).toContain("<span>Author</span>");
	});

	it("renders list", () => {
		const result = renderElement(ul(null, li(null, "One"), li(null, "Two"), li(null, "Three")));
		expect(result).toBe("<ul><li>One</li><li>Two</li><li>Three</li></ul>");
	});
});
