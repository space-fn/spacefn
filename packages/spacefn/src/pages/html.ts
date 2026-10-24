const RAW = Symbol("raw");

/** Markup that is already safe to output. Only wrap strings you built or trust. */
export class Raw {
	readonly [RAW] = true;
	constructor(readonly value: string) {}
}

export function raw(value: string): Raw {
	return new Raw(value);
}

/** Output of `html`. Turn it into a string with `String(...)` or pass it to `c.html`. */
export class Html {
	constructor(readonly value: string) {}
	toString(): string {
		return this.value;
	}
}

const ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

export function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (char) => ESCAPES[char] as string);
}

/**
 * A `css` tagged template. Returns the CSS text with interpolations spliced in.
 * Values are coerced to strings; `</style>` is escaped so an interpolated value
 * cannot break out of a `<style>` block.
 */
export function css(strings: TemplateStringsArray, ...values: Array<string | number>): string {
	let out = strings[0] ?? "";
	for (let i = 0; i < values.length; i++) {
		const value = String(values[i]).replace(/<\/style/gi, "<\\/style");
		out += value + (strings[i + 1] ?? "");
	}
	return out;
}

/**
 * Minifies HTML conservatively: collapses whitespace between tags and trims
 * the result. Content inside `<pre>`, `<code>`, `<textarea>`, `<script>` and
 * `<style>` is preserved byte-for-byte. Opt-in; the `html` tag itself keeps
 * whitespace so formatters and inline content are not surprised.
 */
const PRESERVE_BLOCKS = /<(pre|code|textarea|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;

export function minifyHtml(input: Html | string): string {
	const value = input instanceof Html ? input.value : input;
	const placeholders: string[] = [];
	let s = value.replace(PRESERVE_BLOCKS, (match) => {
		placeholders.push(match);
		return `\u0000${placeholders.length - 1}\u0000`;
	});
	s = s.replace(/>\s+</g, "><");
	s = s.replace(/^\s+|\s+$/g, "");
	// oxlint-disable-next-line no-control-regex
	s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => placeholders[Number(i)] as string);
	return s;
}

type Part = string | number | boolean | null | undefined | Raw | Html | Part[];

function render(value: Part): string {
	if (value === null || value === undefined || value === false) return "";
	if (value instanceof Raw) return value.value;
	if (value instanceof Html) return value.value;
	if (Array.isArray(value)) return value.map(render).join("");
	return escapeHtml(String(value));
}

/**
 * Builds markup from a template. Every interpolated value is escaped, arrays are
 * joined, and `null`, `undefined` and `false` render nothing. Use `raw()` to place
 * markup you have already made safe.
 *
 *     html`<li>${todo.title}</li>`
 */
export function html(strings: TemplateStringsArray, ...values: Part[]): Html {
	let out = strings[0] ?? "";
	for (let i = 0; i < values.length; i++) {
		out += render(values[i] as Part) + (strings[i + 1] ?? "");
	}
	return new Html(out);
}

export { RAW };
