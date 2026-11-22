import { TextDocument } from "vscode-languageserver-textdocument";

import { taggedTemplates, type Span } from "./templates";

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

/** Every piece of CSS in a JS/TS file. */
export function cssRegions(text: string): CssRegion[] {
	return taggedTemplates(text, ["css"]).map((t) =>
		region(text, { start: t.contentStart, end: t.end }, t.holes),
	);
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
