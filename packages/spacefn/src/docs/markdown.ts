import { escapeHtml } from "../pages/html";

type MarkedRenderer = { html: (token: { text: string }) => string };
type Marked = (md: string, options?: { renderer: MarkedRenderer }) => string;

async function loadMarked(): Promise<Marked | null> {
	try {
		// @ts-ignore - optional peer dependency
		const mod = await import("marked");
		const api = mod as unknown as {
			marked?: Marked;
			default?: Marked;
			Renderer?: new () => MarkedRenderer;
		};
		const marked = api.marked ?? api.default;
		if (typeof marked === "function" && api.Renderer) {
			const renderer = new api.Renderer();
			renderer.html = ({ text }) => escapeHtml(text);
			return (md) => marked(md, { renderer });
		}
		return null;
	} catch {
		return null;
	}
}

const SHIKI_LANGS = [
	"ts",
	"js",
	"tsx",
	"jsx",
	"sh",
	"bash",
	"json",
	"md",
	"css",
	"html",
	"yaml",
	"toml",
	"sql",
	"diff",
	"py",
	"rust",
	"go",
];

async function loadShiki(): Promise<{
	codeToHtml: (
		code: string,
		opts: { lang: string; theme?: string; themes?: { light: string; dark: string } },
	) => string;
} | null> {
	try {
		// @ts-ignore - optional peer dependency
		const mod = await import("shiki");
		const createHighlighter = (
			mod as {
				createHighlighter?: (o: {
					themes: string[];
					langs: string[];
				}) => Promise<{ codeToHtml: (c: string, o: { lang: string; theme: string }) => string }>;
			}
		).createHighlighter;
		if (!createHighlighter) return null;
		const highlighter = await createHighlighter({
			themes: ["github-light", "github-dark"],
			langs: SHIKI_LANGS,
		});
		return highlighter as any;
	} catch {
		return null;
	}
}

let shikiPromise: Promise<{
	codeToHtml: (
		code: string,
		opts: { lang: string; theme?: string; themes?: { light: string; dark: string } },
	) => string;
} | null> | null = null;
function getShiki() {
	if (!shikiPromise) {
		shikiPromise = loadShiki().catch((err) => {
			shikiPromise = null;
			throw err;
		});
	}
	return shikiPromise;
}

export function fallbackRender(md: string): string {
	const lines = md.split(/\r?\n/);
	const out: string[] = [];
	let inCode = false;
	let codeBuf: string[] = [];
	for (const line of lines) {
		if (line.startsWith("```")) {
			if (inCode) {
				out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
				codeBuf = [];
				inCode = false;
			} else {
				inCode = true;
			}
			continue;
		}
		if (inCode) {
			codeBuf.push(line);
			continue;
		}
		const h = /^(#{1,6})\s+(.*?)(?:\s+#+\s*)?$/.exec(line);
		if (h) {
			out.push(`<h${h[1]!.length}>${escapeHtml(h[2]!)}</h${h[1]!.length}>`);
			continue;
		}
		if (line.trim() === "") continue;
		out.push(`<p>${escapeHtml(line)}</p>`);
	}
	return out.join("\n");
}

const ENTITY_MAP: Record<string, string> = {
	"&lt;": "<",
	"&gt;": ">",
	"&amp;": "&",
	"&quot;": '"',
	"&#39;": "'",
	"&#34;": '"',
};

function decodeHtml(s: string): string {
	return s.replace(/&(?:lt|gt|amp|quot|#39|#34|#\d+|#x[0-9a-f]+);/gi, (m) => {
		if (ENTITY_MAP[m]) return ENTITY_MAP[m] as string;
		const num = /^&#(\d+);$/.exec(m);
		if (num) return String.fromCharCode(Number(num[1]));
		const hex = /^&#x([0-9a-f]+);$/i.exec(m);
		if (hex) return String.fromCharCode(parseInt(hex[1]!, 16));
		return m;
	});
}

export async function renderMarkdown(md: string): Promise<string> {
	const marked = await loadMarked();
	if (!marked) return fallbackRender(md);
	let html = marked(md);
	// highlight code blocks with shiki if available
	const shiki = await getShiki().catch(() => null);
	if (shiki) {
		html = html.replace(
			/<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
			(_m, lang, code) => {
				try {
					return shiki.codeToHtml(decodeHtml(code).replace(/\t/g, "   "), {
						lang,
						themes: { light: "github-light", dark: "github-dark" },
					});
				} catch {
					return _m;
				}
			},
		);
	}
	return html;
}
