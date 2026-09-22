// ─── HTML Builder ─────────────────────────────────────────────────────────────
// Functional HTML element construction: h.div(attrs, ...children) → string
// Type-safe attributes per element with a11y enforcement

import type { TagAttributes } from "./attr.js";

// ─── Core Types ───────────────────────────────────────────────────────────────

type HtmlChild = string | number | boolean | null | undefined | HtmlElement;
type AttrValue = string | number | boolean | null | undefined;

interface HtmlElement {
	tag: string;
	attrs: Record<string, AttrValue>;
	children: HtmlChild[];
}

// ─── Typed Tag Function ───────────────────────────────────────────────────────

/** Type-safe tag function: attrs are typed per element, a11y-required attrs enforced */
type TypedTagFn<Tag extends keyof TagAttributes> = (
	attrs: TagAttributes[Tag] | null,
	...children: HtmlChild[]
) => HtmlElement;

/** Fallback for tags not in TagAttributes */
type TagFn = (attrs: Record<string, AttrValue> | null, ...children: HtmlChild[]) => HtmlElement;

// ─── Self-closing (void) elements ─────────────────────────────────────────────

const VOID_ELEMENTS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);

// ─── Attribute escaping ───────────────────────────────────────────────────────

const ESCAPE_MAP: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

function escapeAttr(value: string): string {
	return value.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>]/g, (ch) => ESCAPE_MAP[ch]);
}

// ─── Render attributes ────────────────────────────────────────────────────────

function renderAttrs(attrs: Record<string, AttrValue>): string {
	let result = "";
	for (const [key, value] of Object.entries(attrs)) {
		if (value === null || value === undefined) continue;
		if (value === true) {
			result += ` ${key}`;
		} else if (value === false) {
			continue;
		} else {
			result += ` ${key}="${escapeAttr(String(value))}"`;
		}
	}
	return result;
}

// ─── Render children ──────────────────────────────────────────────────────────

function renderChildren(children: HtmlChild[]): string {
	let result = "";
	for (const child of children) {
		if (child === null || child === undefined || child === false) continue;
		if (child === true) continue;
		if (typeof child === "number") {
			result += String(child);
		} else if (typeof child === "string") {
			result += escapeHtml(child);
		} else if (isHtmlElement(child)) {
			result += renderElement(child);
		}
	}
	return result;
}

function isHtmlElement(value: unknown): value is HtmlElement {
	return (
		typeof value === "object" &&
		value !== null &&
		"tag" in value &&
		"attrs" in value &&
		"children" in value
	);
}

// ─── Render element ───────────────────────────────────────────────────────────

export function renderElement(element: HtmlElement): string {
	const { tag, attrs, children } = element;

	// raw() — output children verbatim (no tag, no escaping)
	if (tag === "") {
		let result = "";
		for (const child of children) {
			if (child === null || child === undefined || typeof child === "boolean") continue;
			if (typeof child === "number") {
				result += String(child);
			} else if (typeof child === "string") {
				result += child;
			} else if (isHtmlElement(child)) {
				result += renderElement(child);
			}
		}
		return result;
	}

	const attrStr = renderAttrs(attrs);

	if (VOID_ELEMENTS.has(tag)) {
		return `<${tag}${attrStr}>`;
	}

	if (children.length === 0) {
		return `<${tag}${attrStr}></${tag}>`;
	}

	return `<${tag}${attrStr}>${renderChildren(children)}</${tag}>`;
}

// ─── Element factory ──────────────────────────────────────────────────────────

function createElement(
	tag: string,
	attrs: Record<string, AttrValue> | null,
	...children: HtmlChild[]
): HtmlElement {
	return {
		tag,
		attrs: attrs ?? {},
		children: children.flat(Infinity).filter((c): c is HtmlChild => c !== null && c !== undefined),
	};
}

function makeTag(tag: string): TagFn {
	return (attrs, ...children) => createElement(tag, attrs, ...children);
}

// ─── HTML tag functions (type-safe) ───────────────────────────────────────────

// Block elements
export const div = makeTag("div") as TypedTagFn<"div">;
export const section = makeTag("section") as TypedTagFn<"section">;
export const article = makeTag("article") as TypedTagFn<"article">;
export const main = makeTag("main") as TypedTagFn<"main">;
export const header = makeTag("header") as TypedTagFn<"header">;
export const footer = makeTag("footer") as TypedTagFn<"footer">;
export const nav = makeTag("nav") as TypedTagFn<"nav">;
export const aside = makeTag("aside") as TypedTagFn<"aside">;
export const address = makeTag("address") as TypedTagFn<"address">;
export const search = makeTag("search") as TypedTagFn<"search">;

// Typography
export const h1 = makeTag("h1") as TypedTagFn<"h1">;
export const h2 = makeTag("h2") as TypedTagFn<"h2">;
export const h3 = makeTag("h3") as TypedTagFn<"h3">;
export const h4 = makeTag("h4") as TypedTagFn<"h4">;
export const h5 = makeTag("h5") as TypedTagFn<"h5">;
export const h6 = makeTag("h6") as TypedTagFn<"h6">;
export const p = makeTag("p") as TypedTagFn<"p">;
export const span = makeTag("span") as TypedTagFn<"span">;
export const blockquote = makeTag("blockquote") as TypedTagFn<"blockquote">;
export const pre = makeTag("pre") as TypedTagFn<"pre">;
export const code = makeTag("code") as TypedTagFn<"code">;

// Lists
export const ul = makeTag("ul") as TypedTagFn<"ul">;
export const ol = makeTag("ol") as TypedTagFn<"ol">;
export const li = makeTag("li") as TypedTagFn<"li">;
export const figure = makeTag("figure") as TypedTagFn<"figure">;
export const figcaption = makeTag("figcaption") as TypedTagFn<"figcaption">;
export const dl = makeTag("dl") as TypedTagFn<"dl">;
export const dt = makeTag("dt") as TypedTagFn<"dt">;
export const dd = makeTag("dd") as TypedTagFn<"dd">;

// Links & media
export const a = makeTag("a") as TypedTagFn<"a">;
export const img = makeTag("img") as TypedTagFn<"img">;
export const video = makeTag("video") as TypedTagFn<"video">;
export const audio = makeTag("audio") as TypedTagFn<"audio">;
export const source = makeTag("source") as TypedTagFn<"source">;
export const picture = makeTag("picture") as TypedTagFn<"picture">;
export const canvas = makeTag("canvas") as TypedTagFn<"canvas">;
export const track = makeTag("track") as TypedTagFn<"track">;

// Forms
export const form = makeTag("form") as TypedTagFn<"form">;
export const input = makeTag("input") as TypedTagFn<"input">;
export const textarea = makeTag("textarea") as TypedTagFn<"textarea">;
export const select = makeTag("select") as TypedTagFn<"select">;
export const selectedcontent = makeTag("selectedcontent") as TypedTagFn<"selectedcontent">;
export const option = makeTag("option") as TypedTagFn<"option">;
export const optgroup = makeTag("optgroup") as TypedTagFn<"optgroup">;
export const button = makeTag("button") as TypedTagFn<"button">;
export const label = makeTag("label") as TypedTagFn<"label">;
export const fieldset = makeTag("fieldset") as TypedTagFn<"fieldset">;
export const legend = makeTag("legend") as TypedTagFn<"legend">;
export const datalist = makeTag("datalist") as TypedTagFn<"datalist">;
export const meter = makeTag("meter") as TypedTagFn<"meter">;
export const progress = makeTag("progress") as TypedTagFn<"progress">;
export const output = makeTag("output") as TypedTagFn<"output">;

// Table
export const table = makeTag("table") as TypedTagFn<"table">;
export const thead = makeTag("thead") as TypedTagFn<"thead">;
export const tbody = makeTag("tbody") as TypedTagFn<"tbody">;
export const tfoot = makeTag("tfoot") as TypedTagFn<"tfoot">;
export const tr = makeTag("tr") as TypedTagFn<"tr">;
export const th = makeTag("th") as TypedTagFn<"th">;
export const td = makeTag("td") as TypedTagFn<"td">;
export const caption = makeTag("caption") as TypedTagFn<"caption">;
export const colgroup = makeTag("colgroup") as TypedTagFn<"colgroup">;
export const col = makeTag("col") as TypedTagFn<"col">;

// Void elements
export const br = makeTag("br") as TypedTagFn<"br">;
export const hr = makeTag("hr") as TypedTagFn<"hr">;
export const meta = makeTag("meta") as TypedTagFn<"meta">;
export const link = makeTag("link") as TypedTagFn<"link">;
export const wbr = makeTag("wbr") as TypedTagFn<"wbr">;
export const embed = makeTag("embed") as TypedTagFn<"embed">;
export const area = makeTag("area") as TypedTagFn<"area">;

// Document
export const html = makeTag("html") as TypedTagFn<"html">;
export const head = makeTag("head") as TypedTagFn<"head">;
export const body = makeTag("body") as TypedTagFn<"body">;
export const title = makeTag("title") as TypedTagFn<"title">;
export const style = makeTag("style") as TypedTagFn<"style">;
export const script = makeTag("script") as TypedTagFn<"script">;
export const noscript = makeTag("noscript") as TypedTagFn<"noscript">;
export const base = makeTag("base") as TypedTagFn<"base">;
export const template = makeTag("template") as TypedTagFn<"template">;

// Embedded
export const iframe = makeTag("iframe") as TypedTagFn<"iframe">;
export const object = makeTag("object") as TypedTagFn<"object">;
export const map = makeTag("map") as TypedTagFn<"map">;

// Interactive
export const details = makeTag("details") as TypedTagFn<"details">;
export const summary = makeTag("summary") as TypedTagFn<"summary">;
export const dialog = makeTag("dialog") as TypedTagFn<"dialog">;

// Text-level semantic
export const em = makeTag("em") as TypedTagFn<"em">;
export const strong = makeTag("strong") as TypedTagFn<"strong">;
export const small = makeTag("small") as TypedTagFn<"small">;
export const s = makeTag("s") as TypedTagFn<"s">;
export const cite = makeTag("cite") as TypedTagFn<"cite">;
export const q = makeTag("q") as TypedTagFn<"q">;
export const dfn = makeTag("dfn") as TypedTagFn<"dfn">;
export const abbr = makeTag("abbr") as TypedTagFn<"abbr">;
export const ruby = makeTag("ruby") as TypedTagFn<"ruby">;
export const rt = makeTag("rt") as TypedTagFn<"rt">;
export const rp = makeTag("rp") as TypedTagFn<"rp">;
export const data = makeTag("data") as TypedTagFn<"data">;
export const time = makeTag("time") as TypedTagFn<"time">;
export const var_ = makeTag("var") as TypedTagFn<"var">;
export const samp = makeTag("samp") as TypedTagFn<"samp">;
export const kbd = makeTag("kbd") as TypedTagFn<"kbd">;
export const sub = makeTag("sub") as TypedTagFn<"sub">;
export const sup = makeTag("sup") as TypedTagFn<"sup">;
export const i = makeTag("i") as TypedTagFn<"i">;
export const b = makeTag("b") as TypedTagFn<"b">;
export const u = makeTag("u") as TypedTagFn<"u">;
export const mark = makeTag("mark") as TypedTagFn<"mark">;
export const bdi = makeTag("bdi") as TypedTagFn<"bdi">;
export const bdo = makeTag("bdo") as TypedTagFn<"bdo">;
export const ins = makeTag("ins") as TypedTagFn<"ins">;
export const del = makeTag("del") as TypedTagFn<"del">;

// ─── Raw HTML (unsafe — bypasses escaping) ────────────────────────────────────

export function raw(htmlString: string): HtmlElement {
	return { tag: "", attrs: {}, children: [htmlString] };
}

// ─── Component System ─────────────────────────────────────────────────────────

type ComponentSlots = Record<string, HtmlElement>;

/** Define a reusable component with typed props and optional slots */
function defineComponent<Props, Slots extends ComponentSlots = ComponentSlots>(
	renderFn: (props: Props, slots: Slots) => HtmlElement,
): (props: Props, slots?: Slots) => HtmlElement {
	return (props, slots) => renderFn(props, (slots ?? {}) as Slots);
}

/** Render a component's HtmlElement to an HTML string */
function renderComponent(element: HtmlElement): string {
	return renderElement(element);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export type { HtmlElement, HtmlChild, AttrValue, TagFn, TypedTagFn };
export type { TagAttributes } from "./attr.js";
export type { HtmlTagAttrs } from "./attr.js";

// Named export as `h` for convenience
export const h = {
	// Block
	div,
	section,
	article,
	main,
	header,
	footer,
	nav,
	aside,
	address,
	search,
	// Typography
	h1,
	h2,
	h3,
	h4,
	h5,
	h6,
	p,
	span,
	blockquote,
	pre,
	code,
	// Text semantic
	em,
	strong,
	small,
	s,
	cite,
	q,
	dfn,
	abbr,
	ruby,
	rt,
	rp,
	data,
	time,
	var: var_,
	samp,
	kbd,
	sub,
	sup,
	i,
	b,
	u,
	mark,
	bdi,
	bdo,
	ins,
	del,
	// Lists
	ul,
	ol,
	li,
	figure,
	figcaption,
	dl,
	dt,
	dd,
	// Links & media
	a,
	img,
	video,
	audio,
	source,
	picture,
	canvas,
	track,
	// Forms
	form,
	input,
	textarea,
	select,
	selectedcontent,
	option,
	optgroup,
	button,
	label,
	fieldset,
	legend,
	datalist,
	meter,
	progress,
	output,
	// Table
	table,
	thead,
	tbody,
	tfoot,
	tr,
	th,
	td,
	caption,
	colgroup,
	col,
	// Void
	br,
	hr,
	meta,
	link,
	wbr,
	embed,
	area,
	// Document
	html,
	head,
	body,
	title,
	style,
	script,
	noscript,
	base,
	template,
	// Embedded
	iframe,
	object,
	map,
	// Interactive
	details,
	summary,
	dialog,
	// Utilities
	raw,
};

export { defineComponent, renderComponent };
