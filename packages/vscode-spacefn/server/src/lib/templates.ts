/** A tagged template literal such as html`...`: `start` is the tag, `contentStart`/`end` bound the body. */
export interface TaggedTemplate {
	tag: string;
	start: number;
	contentStart: number;
	end: number;
}

/**
 * Finds every template literal tagged with one of `tags`, nested ones included.
 *
 * It reads the source as JavaScript, skipping comments and strings, so a comment that
 * mentions `css` or "html`" is not mistaken for a template.
 */
export function taggedTemplates(text: string, tags: readonly string[]): TaggedTemplate[] {
	const out: TaggedTemplate[] = [];

	// Scans code from `i`; with `inBraces`, stops after the `}` closing a `${`.
	const code = (i: number, inBraces: boolean): number => {
		let depth = 0;
		while (i < text.length) {
			const ch = text[i]!;
			const next = text[i + 1];
			if (ch === "/" && next === "/") {
				const nl = text.indexOf("\n", i);
				i = nl === -1 ? text.length : nl + 1;
			} else if (ch === "/" && next === "*") {
				const close = text.indexOf("*/", i + 2);
				i = close === -1 ? text.length : close + 2;
			} else if (ch === "'" || ch === '"') {
				i = quoted(i, ch);
			} else if (ch === "`") {
				i = template(i);
			} else if (ch === "{") {
				depth++;
				i++;
			} else if (ch === "}") {
				if (inBraces && depth === 0) return i + 1;
				depth--;
				i++;
			} else i++;
		}
		return i;
	};

	const quoted = (i: number, quote: string): number => {
		i++;
		while (i < text.length && text[i] !== quote && text[i] !== "\n") i += text[i] === "\\" ? 2 : 1;
		return i + 1;
	};

	// `i` is the opening backtick; returns the index after the closing one.
	const template = (i: number): number => {
		const tag = /([A-Za-z_$][\w$]*)\s*$/.exec(text.slice(Math.max(0, i - 64), i));
		const contentStart = i + 1;
		i = contentStart;
		while (i < text.length && text[i] !== "`") {
			if (text[i] === "\\") i += 2;
			else if (text[i] === "$" && text[i + 1] === "{") i = code(i + 2, true);
			else i++;
		}
		if (tag && tags.includes(tag[1]!) && i < text.length) {
			out.push({ tag: tag[1]!, start: contentStart - 1 - tag[0].length, contentStart, end: i });
		}
		return i + 1;
	};

	code(0, false);
	return out.sort((a, b) => a.contentStart - b.contentStart);
}

/** The innermost template tagged with one of `tags` whose body contains `offset`. */
export function templateAt(
	text: string,
	offset: number,
	tags: readonly string[],
): TaggedTemplate | null {
	let best: TaggedTemplate | null = null;
	for (const t of taggedTemplates(text, tags)) {
		if (
			t.contentStart <= offset &&
			offset <= t.end &&
			(!best || t.contentStart > best.contentStart)
		)
			best = t;
	}
	return best;
}
