export type TocEntry = { depth: 2 | 3; text: string; id: string };

function decode(s: string): string {
	return s
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&");
}

/** Returns a slug function that suffixes repeats, like GitHub: `a`, `a-1`, `a-2`. */
export function slugger(): (text: string) => string {
	const seen = new Map<string, number>();
	return (text) => {
		const base =
			text
				.toLowerCase()
				.replace(/[^\p{L}\p{N}\s-]/gu, "")
				.trim()
				.replace(/\s+/g, "-") || "section";
		const n = seen.get(base) ?? 0;
		seen.set(base, n + 1);
		return n ? `${base}-${n}` : base;
	};
}

/** Gives h2–h4 ids and anchor links, and collects h2/h3 for the "On this page" list. */
export function addHeadingAnchors(html: string): { html: string; toc: TocEntry[] } {
	const slug = slugger();
	const toc: TocEntry[] = [];
	const out = html.replace(
		/<h([2-4])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/g,
		(_m, level: string, inner: string) => {
			const text = decode(inner.replace(/<[^>]+>/g, "")).trim();
			const id = slug(text);
			const depth = Number(level);
			if (depth === 2 || depth === 3) toc.push({ depth, text, id });
			return `<h${level} id="${id}"><a class="heading-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${level}>`;
		},
	);
	return { html: out, toc };
}

const CALLOUTS: Record<string, string> = {
	NOTE: "Note",
	TIP: "Tip",
	IMPORTANT: "Important",
	WARNING: "Warning",
	CAUTION: "Caution",
};

/** Turns GitHub-style `> [!NOTE]` blockquotes into styled callouts. */
export function addCallouts(html: string): string {
	return html.replace(
		/<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/g,
		(_m, kind: string) =>
			`<blockquote class="callout callout-${kind.toLowerCase()}"><p class="callout-title">${CALLOUTS[kind]}</p><p>`,
	);
}

/** Wraps tables so wide ones scroll on their own instead of the page. */
export function wrapTables(html: string): string {
	return html
		.replace(/<table>/g, '<div class="table-wrap"><table>')
		.replace(/<\/table>/g, "</table></div>");
}

export function enhance(html: string): { html: string; toc: TocEntry[] } {
	return addHeadingAnchors(wrapTables(addCallouts(html)));
}
