import { getLanguageService, TokenType } from "vscode-html-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";

import { taggedTemplates, type Span, type TaggedTemplate } from "./templates";

const htmlLS = getLanguageService();

/** CSS embedded in a JS/TS file: `[start, end)` is in the host, `holes` and `doc` start from 0. */
export interface CssRegion extends Span {
	holes: Span[];
	/** The CSS with each `${...}` masked, at the same offsets. */
	doc: TextDocument;
}

/**
 * Whether a `${...}` stands for whole declarations or rules, as in `.a { ${decls} }`,
 * and not for part of one, as in `color: ${color}` or `.${name} {`.
 */
function standsAlone(before: string, after: string): boolean {
	const previous = before
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.trimEnd()
		.at(-1);
	if (previous && !";{}".includes(previous)) return false;
	if (/^\s*[{,]/.test(after)) return false;
	return /^[ \t]*(?:[;}\r\n]|\$\{|\/\*|$)/.test(after);
}

/** Text of `length` that parses as what the hole between `before` and `after` stands for. */
function standIn(before: string, after: string, length: number): string {
	if (standsAlone(before, after)) return " ".repeat(length);
	if (after.startsWith("%")) return "0".repeat(length);
	// `#aaa` is both a color and an id; any other length isn't a color.
	if (before.endsWith("#")) return "aaa".padEnd(length);
	return "x".repeat(length);
}

/** The CSS with each hole replaced by a stand-in, without moving any offset. */
function maskHoles(css: string, holes: readonly Span[]): string {
	let out = "";
	let at = 0;
	for (const { start, end } of holes) {
		out += css.slice(at, start);
		const [first = "", ...lines] = css.slice(start, end).split("\n");
		const head = standIn(out, css.slice(end), first.length);
		out += [head, ...lines.map((l) => " ".repeat(l.length))].join("\n");
		at = end;
	}
	return out + css.slice(at);
}

function region(text: string, { start, end }: Span, templateHoles: readonly Span[]): CssRegion {
	const holes = templateHoles
		.filter((h) => h.start >= start && h.end <= end)
		.map((h) => ({ start: h.start - start, end: h.end - start }));
	const css = maskHoles(text.slice(start, end), holes);
	const doc = TextDocument.create("file:///embedded.css", "css", 1, css);
	return { start, end, holes, doc };
}

/** What is between each `<style>` and `</style>` of an html template, unless its type isn't CSS. */
function styleBodies(text: string, { contentStart, end, holes }: TaggedTemplate): Span[] {
	// A `>`, a quote or a tag inside a `${...}` is JavaScript, so the HTML scanner mustn't see it.
	let markup = "";
	let at = contentStart;
	for (const hole of holes) {
		markup += text.slice(at, hole.start) + "x".repeat(hole.end - hole.start);
		at = hole.end;
	}
	markup += text.slice(at, end);
	if (!/<style/i.test(markup)) return [];

	const bodies: Span[] = [];
	const scanner = htmlLS.createScanner(markup);
	let tag = "";
	let attribute = "";
	let type = "";
	for (let token = scanner.scan(); token !== TokenType.EOS; token = scanner.scan()) {
		if (token === TokenType.StartTag) {
			tag = scanner.getTokenText().toLowerCase();
			type = "";
		} else if (token === TokenType.AttributeName) {
			attribute = scanner.getTokenText().toLowerCase();
		} else if (token === TokenType.AttributeValue && attribute === "type") {
			type = scanner.getTokenText().replace(/["']/g, "").toLowerCase();
		} else if (token === TokenType.StartTagClose && tag === "style") {
			if (type && type !== "text/css") continue;
			const start = scanner.getTokenEnd();
			const rest = markup.slice(start);
			// While the closing tag is being typed, the CSS ends at the first `</`.
			let length = rest.search(/<\/style/i);
			if (length === -1) length = rest.indexOf("</");
			if (length === -1) length = rest.length;
			bodies.push({ start: contentStart + start, end: contentStart + start + length });
		}
	}
	return bodies;
}

/** Every piece of CSS in a JS/TS file: `css` templates, and `<style>` in `html` templates. */
export function cssRegions(text: string): CssRegion[] {
	return taggedTemplates(text, ["css", "html"]).flatMap((t) => {
		const spans = t.tag === "css" ? [{ start: t.contentStart, end: t.end }] : styleBodies(text, t);
		return spans.map((span) => region(text, span, t.holes));
	});
}

/** The CSS at `offset`, or null outside CSS and inside its `${...}`, which is JavaScript. */
export function cssRegionAt(text: string, offset: number): CssRegion | null {
	const found = cssRegions(text).find(
		({ start, end, holes }) =>
			start <= offset &&
			offset <= end &&
			!holes.some((h) => start + h.start < offset && offset < start + h.end),
	);
	return found ?? null;
}
