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
