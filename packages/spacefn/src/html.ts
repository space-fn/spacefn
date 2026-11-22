/** A piece of markup output only the first time its key appears in a response: see {@link once}. */
interface Once {
	readonly key: string;
	readonly markup: Html;
}

type Part = string | Once;

const resolve = (parts: readonly Part[], seen: Set<string>): string => {
	let out = "";
	for (const part of parts) {
		if (typeof part === "string") out += part;
		else if (!seen.has(part.key)) {
			seen.add(part.key);
			out += resolve(part.markup.parts, seen);
		}
	}
	return out;
};

/** Markup that is safe to output: what `html` builds, or what you wrapped with `raw()`. */
export class Html {
	/** @internal The markup, with each {@link once} kept apart until it's output. */
	readonly parts: readonly Part[];
	constructor(value: string | readonly Part[]) {
		this.parts = typeof value === "string" ? [value] : value;
	}
	/** The markup, with each `once(...)` output only where its key first appears. */
	get value(): string {
		return resolve(this.parts, new Set());
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

const push = (parts: Part[], part: Part) => {
	const last = parts.length - 1;
	if (typeof part === "string" && typeof parts[last] === "string") parts[last] += part;
	else if (part !== "") parts.push(part);
};

const append = (parts: Part[], value: HtmlValue) => {
	if (value === null || value === undefined || value === false) return;
	if (value instanceof Html) for (const part of value.parts) push(parts, part);
	else if (Array.isArray(value)) for (const item of value) append(parts, item);
	else push(parts, escapeHtml(String(value)));
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
	const parts: Part[] = [];
	push(parts, strings[0] ?? "");
	for (let i = 0; i < values.length; i++) {
		append(parts, values[i]);
		push(parts, strings[i + 1] ?? "");
	}
	return new Html(parts);
};

/**
 * Markup output once per response, where it first appears, however many times
 * it's included: like Laravel's `@once`. Its key is the markup itself, or the
 * `key` you give, so different markup can stand for one thing.
 *
 * ```ts
 * const picker = (id: string) =>
 *   html`${once(html`<script type="module" src="/picker.js"></script>`)}<input id="${id}" />`;
 * html`${picker("from")}${picker("to")}`; // one <script>
 * ```
 */
export function once(markup: HtmlValue): Html;
export function once(key: string, markup: HtmlValue): Html;
export function once(first: string | HtmlValue, second?: HtmlValue): Html {
	const markup = html`${arguments.length === 2 ? second : first}`;
	const key = arguments.length === 2 ? (first as string) : markup.value;
	return new Html([{ key, markup }]);
}
