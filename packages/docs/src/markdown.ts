// Markdown to HTML for the reader: GitHub-flavoured Markdown with raw HTML kept,
// code highlighted by Shiki, `<code-group>` tabs, GitHub alerts and Mermaid blocks.
import {
	transformerMetaHighlight,
	transformerNotationDiff,
	transformerNotationErrorLevel,
	transformerNotationFocus,
	transformerNotationHighlight,
} from "@shikijs/transformers";
import { Marked, type Tokens } from "marked";
import { bundledLanguages, createHighlighter, type Highlighter } from "shiki";

export interface TocEntry {
	readonly depth: 2 | 3;
	readonly text: string;
	readonly id: string;
}

/** A page's text under each heading, for search. */
export interface Section {
	readonly id: string | null;
	readonly heading: string | null;
	readonly text: string;
}

export interface Rendered {
	readonly html: string;
	/** The first `# heading`, if the page has one. */
	readonly title: string | null;
	readonly toc: readonly TocEntry[];
	readonly sections: readonly Section[];
	/** Whether the page has a `mermaid` block, so the page loads Mermaid. */
	readonly mermaid: boolean;
	readonly frontmatter: Frontmatter;
}

/** The `key: value` lines between `---` fences at the top of a page. */
export type Frontmatter = Readonly<Record<string, string>>;

export const frontmatter = (source: string): { data: Frontmatter; body: string } => {
	const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
	if (!match) return { data: {}, body: source };
	const data: Record<string, string> = {};
	for (const line of match[1]!.split(/\r?\n/)) {
		const pair = /^([\w-]+):\s*(.*)$/.exec(line);
		if (pair) data[pair[1]!] = pair[2]!.trim().replace(/^(["'])(.*)\1$/, "$2");
	}
	return { data, body: source.slice(match[0].length) };
};

export const escapeHtml = (text: string): string =>
	text.replace(
		/[&<>"']/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
	);

const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	"#39": "'",
	nbsp: " ",
};

const decodeHtml = (text: string): string =>
	text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, name: string) => {
		if (name[0] === "#")
			return String.fromCodePoint(
				name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1)),
			);
		return ENTITIES[name] ?? match;
	});

/** HTML to the text a reader sees. */
export const textOf = (html: string): string =>
	decodeHtml(
		html
			.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
			// Inline tags join their text (Shiki's tokens); others separate it.
			.replace(/<\/?(span|a|em|strong|code|b|i|mark|kbd|sub|sup)\b[^>]*>/gi, "")
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " "),
	).trim();

/** A slug function that suffixes repeats, like GitHub: `a`, `a-1`, `a-2`. */
export const slugger = (): ((text: string) => string) => {
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
};

/** A fence's info string: ```ts [app/routes/index.ts] {2,4-5}``` → language, title, the rest. */
export const parseInfo = (info: string): { lang: string; title: string | null; meta: string } => {
	const [lang = "", ...rest] = info.trim().split(/\s+/);
	const meta = rest.join(" ");
	const title = /\[([^\]]+)\]/.exec(meta)?.[1] ?? null;
	return { lang: lang.toLowerCase(), title, meta: meta.replace(/\[[^\]]*\]/, "").trim() };
};

const THEMES = { light: "github-light", dark: "github-dark" } as const;
const ALIASES: Record<string, string> = { sh: "bash", shell: "bash", zsh: "bash", console: "bash" };
const PLAIN = new Set(["", "text", "txt", "plain", "mermaid"]);

let highlighter: Promise<Highlighter> | undefined;
const getHighlighter = () =>
	(highlighter ??= createHighlighter({ themes: Object.values(THEMES), langs: [] }));

const known = (lang: string): string | null => {
	const name = ALIASES[lang] ?? lang;
	return name in bundledLanguages ? name : null;
};

const highlight = (shiki: Highlighter, code: string, lang: string, meta: string): string => {
	return shiki.codeToHtml(code, {
		// Shiki's "text" is plain lines, for languages it doesn't know.
		lang: known(lang) ?? "text",
		themes: THEMES,
		defaultColor: "light",
		meta: { __raw: meta },
		transformers: [
			transformerNotationDiff(),
			transformerNotationHighlight(),
			transformerNotationFocus(),
			transformerNotationErrorLevel(),
			transformerMetaHighlight(),
		],
	});
};

// Marks where each code block starts, so `<code-group>` can find its blocks.
const BLOCK = "<!--space:code-block-->";

const codeBlock = (lang: string, title: string | null, inner: string): string => {
	const label = title ?? lang;
	const head = label
		? `<div class="code-head"><span class="code-title">${escapeHtml(label)}</span>${title && lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : ""}</div>`
		: "";
	return `${BLOCK}<div class="code-block" data-lang="${escapeHtml(lang)}"${title ? ` data-title="${escapeHtml(title)}"` : ""}>${head}${inner}</div>`;
};

/** `<code-group>` around fenced blocks: one tab per block, named by its `[title]` or language. */
export const codeGroups = (html: string): string =>
	html.replace(/<code-group>([\s\S]*?)<\/code-group>/g, (_match, inner: string) => {
		const blocks = inner
			.split(BLOCK)
			.map((part) => part.trim())
			.filter((part) => part.startsWith('<div class="code-block"'));
		if (blocks.length === 0) return inner;
		const labels = blocks.map(
			(block) =>
				decodeHtml(/data-title="([^"]*)"/.exec(block)?.[1] ?? "") ||
				decodeHtml(/data-lang="([^"]*)"/.exec(block)?.[1] ?? "") ||
				"code",
		);
		const tabs = labels
			.map(
				(label, i) =>
					`<button type="button" role="tab" aria-selected="${i === 0}" data-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`,
			)
			.join("");
		const panels = blocks
			.map((block, i) =>
				block.replace(
					'<div class="code-block"',
					`<div class="code-block" role="tabpanel"${i === 0 ? "" : " hidden"}`,
				),
			)
			.join("");
		return `<div class="code-group"><div class="code-tabs" role="tablist">${tabs}</div>${panels}</div>`;
	});

const ALERTS = {
	NOTE: "Note",
	TIP: "Tip",
	IMPORTANT: "Important",
	WARNING: "Warning",
	CAUTION: "Caution",
} as const;

/** GitHub's `> [!NOTE]` blockquotes, as callouts. `> [!TIP] Title` names one. */
export const alerts = (html: string): string =>
	html
		.replace(
			/<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*([^\n<]*)(?:\n|(?=<\/p>))/g,
			(_match, kind: keyof typeof ALERTS, title: string) =>
				`<blockquote class="callout callout-${kind.toLowerCase()}"><p class="callout-title">${title.trim() || ALERTS[kind]}</p><p>`,
		)
		.replace(/<p><\/p>/g, "");

/** Wraps tables so wide ones scroll on their own instead of the page. */
const wrapTables = (html: string): string =>
	html
		.replace(/<table>/g, '<div class="table-wrap"><table>')
		.replace(/<\/table>/g, "</table></div>");

const sectionsOf = (html: string): Section[] => {
	const sections: Section[] = [];
	const heading = /<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g;
	let last = 0;
	let current: { id: string | null; heading: string | null } = { id: null, heading: null };
	for (const match of html.matchAll(heading)) {
		sections.push({ ...current, text: textOf(html.slice(last, match.index)) });
		current = {
			id: match[2]!,
			heading: textOf(match[3]!.replace(/<a class="heading-anchor"[^>]*>#<\/a>/, "")),
		};
		last = match.index + match[0].length;
	}
	sections.push({ ...current, text: textOf(html.slice(last)) });
	return sections.filter((section) => section.heading || section.text);
};

export const renderMarkdown = async (source: string): Promise<Rendered> => {
	const { data, body } = frontmatter(source);
	const shiki = await getHighlighter();
	const slug = slugger();
	const toc: TocEntry[] = [];
	let title: string | null = data.title ?? null;
	let mermaid = false;

	const marked = new Marked({ gfm: true });
	marked.use({
		renderer: {
			code({ text, lang }: Tokens.Code) {
				const info = parseInfo(lang ?? "");
				if (info.lang === "mermaid") {
					mermaid = true;
					return `<div class="mermaid-block"><pre class="mermaid">${escapeHtml(text)}</pre></div>`;
				}
				return codeBlock(info.lang, info.title, highlight(shiki, text, info.lang, info.meta));
			},
			heading({ tokens, depth }: Tokens.Heading) {
				const inner = this.parser.parseInline(tokens);
				const text = textOf(inner);
				if (depth === 1) {
					title ??= text;
					return `<h1>${inner}</h1>\n`;
				}
				const id = slug(text);
				if (depth === 2 || depth === 3) toc.push({ depth, text, id });
				return `<h${depth} id="${id}"><a class="heading-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${depth}>\n`;
			},
		},
	});

	// Load the languages the page uses before rendering, which is synchronous.
	const langs = new Set<string>();
	const tokens = marked.lexer(body);
	// walkTokens returns the results of async walkers; this one is synchronous.
	void marked.walkTokens(tokens, (token) => {
		if (token.type !== "code") return;
		const name = known(parseInfo((token as Tokens.Code).lang ?? "").lang);
		if (name && !PLAIN.has(name)) langs.add(name);
	});
	const missing = [...langs].filter((lang) => !shiki.getLoadedLanguages().includes(lang));
	if (missing.length > 0)
		await shiki.loadLanguage(...(missing as (keyof typeof bundledLanguages)[]));

	const html = wrapTables(alerts(codeGroups(marked.parser(tokens)))).replaceAll(BLOCK, "");
	return { html, title, toc, sections: sectionsOf(html), mermaid, frontmatter: data };
};
