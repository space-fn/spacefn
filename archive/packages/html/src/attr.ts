// ─── HTML Attribute Types ─────────────────────────────────────────────────────
// Full type-safe HTML attributes per element with a11y requirements
// https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes

import type { AttrValue } from "./index.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Allow any string while still offering typed autocomplete */
type LooseAutocomplete = string & {};

// ─── Global Attributes (available on every HTML element) ──────────────────────

interface GlobalAttributes {
	/** Unique identifier */
	id?: string;
	/** CSS class names */
	class?: string;
	/** Inline CSS styles */
	style?: string;
	/** Hidden from display */
	hidden?: boolean | "hidden" | "until-found";
	/** Tab index for keyboard navigation */
	tabindex?: number;
	/** Tooltip text */
	title?: string;
	/** Language of the element's content */
	lang?: string;
	/** Text direction */
	dir?: "ltr" | "rtl" | "auto";
	/** Contenteditable state */
	contenteditable?: boolean | "true" | "false" | "plaintext-only";
	/** Spellcheck */
	spellcheck?: boolean | "true" | "false";
	/** Draggable */
	draggable?: boolean | "true" | "false";
	/** Access key shortcut */
	accesskey?: string;
	/** Form reference */
	form?: string;
	/** Element ID for label association */
	slot?: string;
	/** Click counter (deprecated) */
	clickcount?: string;
	/** Input mode hint for virtual keyboards */
	inputmode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";
	/** Enter key behavior in contenteditable */
	enterkeyhint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
	/** Autocapitalize for virtual keyboards */
	autocapitalize?: "off" | "none" | "on" | "sentences" | "words" | "characters";
	/** Autocorrect */
	autocorrect?: "on" | "off";
	/** Translatable content */
	translate?: "yes" | "no";
	/** Content verification target */
	nonce?: string;
	/** ARIA role */
	role?: string;
	/** Dataset attributes */
	[key: `data-${LooseAutocomplete}`]: AttrValue;
	/** ARIA attributes */
	[key: `aria-${LooseAutocomplete}`]: AttrValue;
}

// ─── Event Handler Attributes ─────────────────────────────────────────────────

interface EventAttributes {
	onclick?: string;
	ondblclick?: string;
	onmousedown?: string;
	onmouseup?: string;
	onmouseover?: string;
	onmousemove?: string;
	onmouseout?: string;
	onkeydown?: string;
	onkeyup?: string;
	onkeypress?: string;
	onfocus?: string;
	onblur?: string;
	onchange?: string;
	oninput?: string;
	onsubmit?: string;
	onreset?: string;
	onselect?: string;
	onscroll?: string;
	onresize?: string;
	onload?: string;
	onerror?: string;
	onabort?: string;
	onbeforeunload?: string;
	onunload?: string;
	onhashchange?: string;
	onpopstate?: string;
	onstorage?: string;
	onanimationend?: string;
	onanimationiteration?: string;
	onanimationstart?: string;
	ontransitionend?: string;
	oncopy?: string;
	oncut?: string;
	onpaste?: string;
	ondrag?: string;
	ondragend?: string;
	ondragenter?: string;
	ondragleave?: string;
	ondragover?: string;
	ondragstart?: string;
	ondrop?: string;
}

// ─── Base (Global + Events) ──────────────────────────────────────────────────

type BaseAttrs = GlobalAttributes & EventAttributes;

// ─── Element-Specific Attributes ─────────────────────────────────────────────

// -- Links --
interface AnchorAttributes {
	href?: string;
	target?: "_self" | "_blank" | "_parent" | "_top" | LooseAutocomplete;
	rel?: string;
	download?: string | boolean;
	hreflang?: string;
	type?: string;
	ping?: string;
	referrerpolicy?:
		| "no-referrer"
		| "no-referrer-when-downgrade"
		| "origin"
		| "origin-when-cross-origin"
		| "same-origin"
		| "strict-origin"
		| "strict-origin-when-cross-origin"
		| "unsafe-url";
	prefetch?: string;
}

// -- Images --
interface ImgAttributes {
	src?: string;
	alt?: string;
	width?: number | string;
	height?: number | string;
	loading?: "lazy" | "eager";
	decoding?: "sync" | "async" | "auto";
	srcset?: string;
	sizes?: string;
	crossOrigin?: "anonymous" | "use-credentials" | "";
	useMap?: string;
	isMap?: boolean;
	referrerPolicy?: string;
}

// -- Media --
interface VideoAttributes {
	src?: string;
	poster?: string;
	preload?: "none" | "metadata" | "auto" | "";
	autoplay?: boolean;
	controls?: boolean;
	loop?: boolean;
	muted?: boolean;
	playsInline?: boolean;
	width?: number | string;
	height?: number | string;
	crossOrigin?: "anonymous" | "use-credentials" | "";
}

interface AudioAttributes {
	src?: string;
	preload?: "none" | "metadata" | "auto" | "";
	autoplay?: boolean;
	controls?: boolean;
	loop?: boolean;
	muted?: boolean;
	crossOrigin?: "anonymous" | "use-credentials" | "";
}

interface SourceAttributes {
	src?: string;
	type?: string;
	srcset?: string;
	sizes?: string;
	media?: string;
	width?: number | string;
	height?: number | string;
}

interface TrackAttributes {
	src?: string;
	kind?: "subtitles" | "captions" | "descriptions" | "chapters" | "metadata";
	srcLang?: string;
	label?: string;
	default?: boolean;
}

// -- Forms --
interface InputAttributes {
	type?:
		| "button"
		| "checkbox"
		| "color"
		| "date"
		| "datetime-local"
		| "email"
		| "file"
		| "hidden"
		| "image"
		| "month"
		| "number"
		| "password"
		| "radio"
		| "range"
		| "reset"
		| "search"
		| "submit"
		| "tel"
		| "text"
		| "time"
		| "url"
		| "week";
	name?: string;
	value?: string | number;
	placeholder?: string;
	disabled?: boolean;
	readonly?: boolean;
	required?: boolean;
	autofocus?: boolean;
	autocomplete?: string;
	min?: number | string;
	max?: number | string;
	step?: number | string;
	minlength?: number;
	maxlength?: number;
	pattern?: string;
	size?: number;
	multiple?: boolean;
	accept?: string;
	alt?: string;
	src?: string;
	checked?: boolean;
	indeterminate?: boolean;
	list?: string;
	form?: string;
	formaction?: string;
	formmethod?: "get" | "post" | "dialog";
	formenctype?: "application/x-www-form-urlencoded" | "multipart/form-data" | "text/plain";
	formnovalidate?: boolean;
	formtarget?: string;
	dirname?: string;
}

interface TextareaAttributes {
	name?: string;
	placeholder?: string;
	disabled?: boolean;
	readonly?: boolean;
	required?: boolean;
	autofocus?: boolean;
	autocomplete?: string;
	rows?: number;
	cols?: number;
	minlength?: number;
	maxlength?: number;
	wrap?: "hard" | "soft";
	dirname?: string;
	value?: string;
}

interface SelectAttributes {
	name?: string;
	disabled?: boolean;
	required?: boolean;
	autofocus?: boolean;
	multiple?: boolean;
	size?: number;
	form?: string;
}

interface OptionAttributes {
	value?: string | number;
	selected?: boolean;
	disabled?: boolean;
	label?: string;
}

interface OptgroupAttributes {
	label?: string;
	disabled?: boolean;
}

interface ButtonAttributes {
	type?: "submit" | "reset" | "button";
	name?: string;
	value?: string;
	disabled?: boolean;
	autofocus?: boolean;
	form?: string;
	formaction?: string;
	formmethod?: "get" | "post" | "dialog";
	formenctype?: string;
	formnovalidate?: boolean;
	formtarget?: string;
	popovertarget?: string;
	popovertargetaction?: "toggle" | "show" | "hide";
}

interface LabelAttributes {
	for?: string;
	form?: string;
}

interface FieldsetAttributes {
	disabled?: boolean;
	form?: string;
	name?: string;
}

interface FormAttributes {
	action?: string;
	method?: "get" | "post" | "dialog";
	enctype?: "application/x-www-form-urlencoded" | "multipart/form-data" | "text/plain";
	target?: string;
	novalidate?: boolean;
	autocomplete?: "on" | "off";
}

interface OutputAttributes {
	for?: string;
	form?: string;
	name?: string;
}

// -- Tables --
interface TableAttributes {
	border?: number | string;
	cellpadding?: number | string;
	cellspacing?: number | string;
}

interface TableCellAttributes {
	colspan?: number;
	rowspan?: number;
	headers?: string;
	scope?: "col" | "colgroup" | "row" | "rowgroup";
	abbr?: string;
	align?: "left" | "center" | "right" | "justify";
	valign?: "top" | "middle" | "bottom" | "baseline";
	width?: number | string;
	height?: number | string;
}

// -- Lists --
interface LiAttributes {
	value?: number;
}

interface OlAttributes {
	reversed?: boolean;
	start?: number;
	type?: "1" | "a" | "A" | "i" | "I";
}

// -- Interactive --
interface DetailsAttributes {
	open?: boolean;
	name?: string;
}

interface DialogAttributes {
	open?: boolean;
	closedby?: "any" | "none" | "closerequest";
}

interface MeterAttributes {
	value?: number;
	min?: number;
	max?: number;
	low?: number;
	high?: number;
	optimum?: number;
	form?: string;
}

interface ProgressAttributes {
	value?: number;
	max?: number;
	form?: string;
}

// -- Canvas --
interface CanvasAttributes {
	width?: number | string;
	height?: number | string;
}

// -- Embeds --
interface IframeAttributes {
	src?: string;
	srcdoc?: string;
	name?: string;
	sandbox?: string;
	allow?: string;
	allowfullscreen?: boolean;
	allowpaymentrequest?: boolean;
	width?: number | string;
	height?: number | string;
	referrerpolicy?: string;
	loading?: "lazy" | "eager";
}

interface ObjectAttributes {
	data?: string;
	type?: string;
	name?: string;
	form?: string;
	width?: number | string;
	height?: number | string;
}

interface EmbedAttributes {
	src?: string;
	type?: string;
	width?: number | string;
	height?: number | string;
}

interface MapAttributes {
	name?: string;
}

interface AreaAttributes {
	alt?: string;
	coords?: string;
	shape?: "rect" | "circle" | "poly" | "default";
	href?: string;
	target?: string;
	rel?: string;
	download?: string;
	ping?: string;
	referrerpolicy?: string;
}

// -- Script/Style --
interface ScriptAttributes {
	src?: string;
	type?: string;
	async?: boolean;
	defer?: boolean;
	crossorigin?: "anonymous" | "use-credentials" | "";
	integrity?: string;
	nomodule?: boolean;
	nonce?: string;
	referrerpolicy?: string;
	text?: string;
}

interface StyleAttributes {
	media?: string;
	nonce?: string;
}

interface LinkAttributes {
	href?: string;
	rel?: string;
	type?: string;
	media?: string;
	integrity?: string;
	crossorigin?: "anonymous" | "use-credentials" | "";
	as?: string;
	hreflang?: string;
	sizes?: string;
	imagesrcset?: string;
	imagesizes?: string;
	disabled?: boolean;
}

interface MetaAttributes {
	charset?: string;
	content?: string;
	httpEquiv?: string;
	name?: string;
}

interface BlockquoteAttributes {
	cite?: string;
}

interface QAttributes {
	cite?: string;
}

interface InsAttributes {
	cite?: string;
	datetime?: string;
}

interface DelAttributes {
	cite?: string;
	datetime?: string;
}

interface TimeAttributes {
	datetime?: string;
}

interface DataAttributes {
	value?: string | number;
}

// ─── Per-Tag Attribute Maps ──────────────────────────────────────────────────
// Maps each HTML tag to its complete attribute type (Global + Events + Specific)

export interface TagAttributes {
	// ─── Document ───────────────────────────────────────────────────────────
	html: BaseAttrs & { xmlns?: string; manifest?: string };
	head: BaseAttrs;
	body: BaseAttrs & {
		onafterprint?: string;
		onbeforeprint?: string;
		onbeforeunload?: string;
		onhashchange?: string;
		onmessage?: string;
		onoffline?: string;
		ononline?: string;
		onpagehide?: string;
		onpageshow?: string;
		onpopstate?: string;
		onstorage?: string;
		onunload?: string;
	};
	title: BaseAttrs;
	meta: BaseAttrs & MetaAttributes;
	link: BaseAttrs & LinkAttributes;
	style: BaseAttrs & StyleAttributes;
	script: BaseAttrs & ScriptAttributes;
	noscript: BaseAttrs;
	template: BaseAttrs & { shadowrootmode?: "open" | "closed" };
	base: BaseAttrs & { href?: string; target?: string };

	// ─── Sections ───────────────────────────────────────────────────────────
	header: BaseAttrs;
	footer: BaseAttrs;
	main: BaseAttrs;
	nav: BaseAttrs;
	aside: BaseAttrs;
	address: BaseAttrs;
	section: BaseAttrs & { cite?: string };
	article: BaseAttrs & { cite?: string };
	hgroup: BaseAttrs;
	search: BaseAttrs;

	// ─── Headings ───────────────────────────────────────────────────────────
	h1: BaseAttrs;
	h2: BaseAttrs;
	h3: BaseAttrs;
	h4: BaseAttrs;
	h5: BaseAttrs;
	h6: BaseAttrs;

	// ─── Grouping ───────────────────────────────────────────────────────────
	p: BaseAttrs;
	hr: BaseAttrs;
	pre: BaseAttrs;
	blockquote: BaseAttrs & BlockquoteAttributes;
	ol: BaseAttrs & OlAttributes;
	ul: BaseAttrs;
	menu: BaseAttrs;
	li: BaseAttrs & LiAttributes;
	dl: BaseAttrs;
	dt: BaseAttrs;
	dd: BaseAttrs;
	figure: BaseAttrs;
	figcaption: BaseAttrs;
	div: BaseAttrs;

	// ─── Text-level ─────────────────────────────────────────────────────────
	a: BaseAttrs & AnchorAttributes;
	em: BaseAttrs;
	strong: BaseAttrs;
	small: BaseAttrs;
	s: BaseAttrs;
	cite: BaseAttrs;
	q: BaseAttrs & QAttributes;
	dfn: BaseAttrs;
	abbr: BaseAttrs & { title?: string };
	ruby: BaseAttrs;
	rt: BaseAttrs;
	rp: BaseAttrs;
	data: BaseAttrs & DataAttributes;
	time: BaseAttrs & TimeAttributes;
	code: BaseAttrs;
	var: BaseAttrs;
	samp: BaseAttrs;
	kbd: BaseAttrs;
	sub: BaseAttrs;
	sup: BaseAttrs;
	i: BaseAttrs;
	b: BaseAttrs;
	u: BaseAttrs;
	mark: BaseAttrs;
	bdi: BaseAttrs;
	bdo: BaseAttrs;
	span: BaseAttrs;
	br: BaseAttrs;
	wbr: BaseAttrs;
	ins: BaseAttrs & InsAttributes;
	del: BaseAttrs & DelAttributes;

	// ─── Embedded ───────────────────────────────────────────────────────────
	picture: BaseAttrs;
	canvas: BaseAttrs & CanvasAttributes;
	source: BaseAttrs & SourceAttributes;
	img: BaseAttrs & ImgAttributes;
	iframe: BaseAttrs & IframeAttributes;
	embed: BaseAttrs & EmbedAttributes;
	object: BaseAttrs & ObjectAttributes;
	video: BaseAttrs & VideoAttributes;
	audio: BaseAttrs & AudioAttributes;
	track: BaseAttrs & TrackAttributes;
	map: BaseAttrs & MapAttributes;
	area: BaseAttrs & AreaAttributes;

	// ─── Tables ─────────────────────────────────────────────────────────────
	table: BaseAttrs & TableAttributes;
	caption: BaseAttrs;
	colgroup: BaseAttrs & { span?: number };
	col: BaseAttrs & { span?: number };
	thead: BaseAttrs;
	tbody: BaseAttrs;
	tfoot: BaseAttrs;
	tr: BaseAttrs;
	td: BaseAttrs & TableCellAttributes;
	th: BaseAttrs &
		TableCellAttributes & {
			abbr?: string;
			scope?: "col" | "colgroup" | "row" | "rowgroup";
		};

	// ─── Forms ──────────────────────────────────────────────────────────────
	form: BaseAttrs & FormAttributes;
	label: BaseAttrs & LabelAttributes;
	input: BaseAttrs & InputAttributes;
	textarea: BaseAttrs & TextareaAttributes;
	select: BaseAttrs & SelectAttributes;
	selectedcontent: BaseAttrs;
	datalist: BaseAttrs;
	option: BaseAttrs & OptionAttributes;
	optgroup: BaseAttrs & OptgroupAttributes;
	button: BaseAttrs & ButtonAttributes;
	fieldset: BaseAttrs & FieldsetAttributes;
	legend: BaseAttrs;
	meter: BaseAttrs & MeterAttributes;
	progress: BaseAttrs & ProgressAttributes;
	output: BaseAttrs & OutputAttributes;

	// ─── Interactive ────────────────────────────────────────────────────────
	details: BaseAttrs & DetailsAttributes;
	summary: BaseAttrs;
	dialog: BaseAttrs & DialogAttributes;

	// ─── Web Components ─────────────────────────────────────────────────────
	slot: BaseAttrs & { name?: string };
	shadowhost: BaseAttrs;
}

// ─── A11y Required Attributes ────────────────────────────────────────────────
// These tags REQUIRE certain attributes for accessibility (WCAG)

interface A11yRequiredAttributes {
	/** <img> MUST have alt — empty string for decorative images */
	img: { alt: string };
	/** <a> SHOULD have href — without it, it's not keyboard-focusable */
	a: { href: string };
	/** <input> MUST have an accessible name */
	input: { id?: string; "aria-label"?: string; "aria-labelledby"?: string };
	/** <textarea> MUST have an accessible name */
	textarea: { id?: string; "aria-label"?: string; "aria-labelledby"?: string };
	/** <select> MUST have an accessible name */
	select: { id?: string; "aria-label"?: string; "aria-labelledby"?: string };
	/** <button> MUST have accessible name — text content is usually sufficient */
	button: {};
	/** <iframe> MUST have title */
	iframe: { title: string };
	/** <video> with audio SHOULD have captions */
	video: {};
	/** <object> MUST have a text alternative */
	object: {};
}

// ─── Final Tag Attribute Types ───────────────────────────────────────────────
// Intersect GlobalAttrs + SpecificAttrs + A11y for each tag

type WithA11y<Tag extends keyof TagAttributes> = Tag extends keyof A11yRequiredAttributes
	? TagAttributes[Tag] & A11yRequiredAttributes[Tag]
	: TagAttributes[Tag];

/** Typed attributes for each HTML tag */
export type HtmlTagAttrs<Tag extends keyof TagAttributes> = WithA11y<Tag>;

/** Convenience: any tag's attributes */
export type AnyTagAttrs = BaseAttrs & { [key: string]: AttrValue };

// ─── A11y Helpers (runtime-enforced optional warnings) ───────────────────────

/**
 * Require alt on <img> — empty string for decorative images.
 * TypeScript will error if alt is missing.
 */
export function imgAlt(alt: string): { alt: string } {
	return { alt };
}

/**
 * Require href on <a>.
 */
export function anchorHref(href: string): { href: string } {
	return { href };
}
