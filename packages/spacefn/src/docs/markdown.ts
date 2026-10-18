function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const esc = escapeHtml;

async function loadMarked(): Promise<((md: string) => string) | null> {
	try {
		// @ts-ignore - optional peer dependency
		const mod = await import("marked");
		const marked =
			(mod as { marked?: (s: string) => string; default?: (s: string) => string }).marked ??
			(mod as { default?: (s: string) => string }).default;
		if (typeof marked === "function") return marked;
		return null;
	} catch {
		return null;
	}
}

async function loadShiki(): Promise<{
	codeToHtml: (code: string, opts: { lang: string; theme: string }) => string;
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
		const highlighter = await createHighlighter({ themes: ["github-light"], langs: [] });
		return highlighter;
	} catch {
		return null;
	}
}

let shikiPromise: Promise<{
	codeToHtml: (c: string, o: { lang: string; theme: string }) => string;
} | null> | null = null;
function getShiki() {
	if (!shikiPromise) shikiPromise = loadShiki();
	return shikiPromise;
}

function fallbackRender(md: string): string {
	const lines = md.split(/\r?\n/);
	const out: string[] = [];
	let inCode = false;
	let codeBuf: string[] = [];
	for (const line of lines) {
		if (line.startsWith("```")) {
			if (inCode) {
				out.push(`<pre><code>${esc(codeBuf.join("\n"))}</code></pre>`);
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
		const h = /^(#{1,6})\s+(.*)$/.exec(line);
		if (h) {
			out.push(`<h${h[1]!.length}>${esc(h[2]!)}</h${h[1]!.length}>`);
			continue;
		}
		if (line.trim() === "") continue;
		out.push(`<p>${esc(line)}</p>`);
	}
	return out.join("\n");
}

export async function renderMarkdown(md: string): Promise<string> {
	const marked = await loadMarked();
	if (!marked) return fallbackRender(md);
	let html = marked(md);
	// highlight code blocks with shiki if available
	const shiki = await getShiki();
	if (shiki) {
		html = html.replace(
			/<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
			(_m, lang, code) => {
				try {
					return shiki.codeToHtml(decodeHtml(code), { lang, theme: "github-light" });
				} catch {
					return _m;
				}
			},
		);
	}
	return html;
}

function decodeHtml(s: string): string {
	return s
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"');
}
