/** Markup that is safe to output: what `html` builds, or what you wrapped with `raw()`. */
export class Html {
	readonly value: string;
	constructor(value: string) {
		this.value = value;
	}
	toString(): string {
		return this.value;
	}
}

/** Marks a string you built or trust as markup, so `html` doesn't escape it. */
export const raw = (value: string): Html => new Html(value);

const ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

export const escapeHtml = (text: string): string =>
	text.replace(/[&<>"']/g, (char) => ESCAPES[char] as string);

/** What `html` accepts in a `${}`. */
export type HtmlValue = string | number | boolean | null | undefined | Html | readonly HtmlValue[];

const render = (value: HtmlValue): string => {
	if (value === null || value === undefined || value === false) return "";
	if (value instanceof Html) return value.value;
	if (Array.isArray(value)) return value.map(render).join("");
	return escapeHtml(String(value));
};

/**
 * Builds markup from a template. Every interpolated value is escaped, arrays
 * are joined, and `null`, `undefined` and `false` render nothing. Nested `html`
 * and `raw()` pass through.
 *
 * ```ts
 * html`<ul>${todos.map((todo) => html`<li>${todo.title}</li>`)}</ul>`
 * ```
 */
export const html = (strings: TemplateStringsArray, ...values: readonly HtmlValue[]): Html => {
	let out = strings[0] ?? "";
	for (let i = 0; i < values.length; i++) out += render(values[i]) + (strings[i + 1] ?? "");
	return new Html(out);
};
