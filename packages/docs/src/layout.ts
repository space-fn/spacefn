// The reader's HTML around a rendered page: top bar, sidebar, "On this page", pager.
import { escapeHtml, type TocEntry } from "./markdown.ts";
import { type DocNode, type DocPage, flattenPages, groupOf, urlPath } from "./tree.ts";

/** Where the reader's own files (styles, script, search index) are served, under its base. */
export const ASSETS = "_/";

/** The Mermaid build the browser loads: kept off disk, since it'd add 100+ MB to every app. */
export const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@12.3.0/dist/mermaid.esm.min.mjs";

/** Tabler's icons, by name, from a CDN like Mermaid: offline, the sidebar shows no icons. */
export const TABLER_URL = "https://cdn.jsdelivr.net/npm/@tabler/icons@3.50.0/icons/";

/** A sidebar icon: the SVG as a mask, so it takes the link's color. `-filled` names the filled set. */
const tabler = (name: string | null) => {
	if (!name) return "";
	const filled = name.endsWith("-filled");
	const file = `${filled ? "filled" : "outline"}/${filled ? name.slice(0, -"-filled".length) : name}.svg`;
	return `<span class="nav-icon" style="--icon:url(${TABLER_URL}${file})" aria-hidden="true"></span>`;
};

const icon = (body: string, extra = "") =>
	`<svg class="icon${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS = {
	search: icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
	sun: icon(
		'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
		" icon-sun",
	),
	moon: icon('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>', " icon-moon"),
	menu: icon('<path d="M4 7h16M4 12h16M4 17h16"/>'),
	list: icon('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
	folder: icon(
		'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
	),
	file: icon(
		'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>',
	),
};

/** One docs folder as the reader shows it: a tab in the top bar, its own sidebar. */
export interface SourceView {
	readonly label: string;
	/** Its URL: the reader's base plus the source's prefix, ending in `/`. */
	readonly href: string;
	readonly version: string | null;
	/** The logo's URL, if the folder has one. */
	readonly logo: string | null;
}

export interface PageInput {
	readonly title: string;
	readonly html: string;
	readonly toc: readonly TocEntry[];
	readonly mermaid: boolean;
	/** The reader's base URL, ending in `/`. */
	readonly base: string;
	readonly sources: readonly SourceView[];
	readonly source: SourceView;
	readonly tree: readonly DocNode[];
	/** The shown page or folder, relative to the source's folder. */
	readonly rel: string;
	/** The site's name in the top bar and the tab title. */
	readonly name: string;
}

export const pageHref = (source: SourceView, rel: string): string =>
	source.href + urlPath(rel).split("/").map(encodeURIComponent).join("/");

const dirHref = (source: SourceView, rel: string) => `${pageHref(source, rel)}/`;

const active = (on: boolean) => (on ? ' class="active" aria-current="page"' : "");

/**
 * A sidebar folder's `<details>` attributes: open when it holds the current page, and
 * `data-nav` to remember it by, so `NAV_BOOT` and the reader's script keep the ones you
 * opened or closed that way on the next page.
 */
const folderState = (source: SourceView, rel: string, current: string) => {
	const here = current.startsWith(`${rel}/`);
	return `${here ? " open data-current" : ""} data-nav="${escapeHtml(source.href + rel)}"`;
};

const navList = (source: SourceView, nodes: readonly DocNode[], current: string): string => {
	const items = nodes.map((node) => {
		if (node.kind === "page")
			return `<li><a href="${pageHref(source, node.rel)}"${active(node.rel === current)}>${tabler(node.icon)}${escapeHtml(node.title)}</a></li>`;
		return `<li><details${folderState(source, node.rel, current)}><summary><span>${tabler(node.icon)}${escapeHtml(node.label)}</span></summary>${navList(source, node.children, current)}</details></li>`;
	});
	return `<ul class="nav-list">${items.join("")}</ul>`;
};

/** The tree in reading order: each run of loose pages as a list, each folder as a titled group. */
const sidebar = (input: PageInput): string => {
	const { source, tree, rel } = input;
	const parts: string[] = [];
	let pages: DocPage[] = [];
	const flush = () => {
		if (pages.length)
			parts.push(
				`<ul class="nav-top">${pages
					.map(
						(page) =>
							`<li><a href="${pageHref(source, page.rel)}"${active(page.rel === rel)}>${tabler(page.icon)}${escapeHtml(page.title)}</a></li>`,
					)
					.join("")}</ul>`,
			);
		pages = [];
	};
	for (const node of tree) {
		if (node.kind === "page") {
			pages.push(node);
			continue;
		}
		flush();
		parts.push(
			`<details class="nav-group"${folderState(source, node.rel, rel)}><summary class="nav-group-title">${tabler(node.icon)}${escapeHtml(node.label)}</summary>${navList(source, node.children, rel)}</details>`,
		);
	}
	flush();
	const tabs =
		input.sources.length > 1 ? `<div class="nav-sources">${sourceTabs(input)}</div>` : "";
	return `<aside class="sidebar" id="sidebar">${tabs}<nav aria-label="Docs">${parts.join("")}</nav><script>${NAV_BOOT}</script></aside>`;
};

const sourceTabs = ({ sources, source }: PageInput) =>
	sources
		.map(
			(view) =>
				`<a class="source-tab${view === source ? " active" : ""}" href="${view.href}">${escapeHtml(view.label)}${view.version ? `<span class="version">v${escapeHtml(view.version)}</span>` : ""}</a>`,
		)
		.join("");

const toc = (entries: readonly TocEntry[]) => {
	if (entries.length < 2) return '<aside class="toc"></aside>';
	const items = entries
		.map(
			(entry) =>
				`<li class="depth-${entry.depth}"><a href="#${entry.id}">${escapeHtml(entry.text)}</a></li>`,
		)
		.join("");
	return `<aside class="toc"><p class="toc-title">${ICONS.list}On this page</p><ul>${items}</ul></aside>`;
};

const pager = ({ source, tree, rel }: PageInput) => {
	const pages = flattenPages(tree);
	const i = pages.findIndex((page) => page.rel === rel);
	if (i === -1) return "";
	const link = (page: DocPage | undefined, cls: string, label: string) =>
		page
			? `<a class="${cls}" href="${pageHref(source, page.rel)}"><small>${label}</small><strong>${escapeHtml(page.title)}</strong></a>`
			: "";
	const prev = link(pages[i - 1], "prev", "← Previous");
	const next = link(pages[i + 1], "next", "Next →");
	return prev || next ? `<nav class="pager" aria-label="Pagination">${prev}${next}</nav>` : "";
};

/** A folder without an index page: a card per entry. */
export const cards = (source: SourceView, nodes: readonly DocNode[]): string => {
	const items = nodes.map((node) => {
		const [href, title, meta, glyph] =
			node.kind === "dir"
				? [
						dirHref(source, node.rel),
						node.label,
						`${flattenPages(node.children).length} pages`,
						ICONS.folder,
					]
				: [pageHref(source, node.rel), node.title, node.description ?? "", ICONS.file];
		return `<li><a class="card" href="${href}"><span class="card-title">${glyph}${escapeHtml(title)}</span>${meta ? `<span class="card-meta">${escapeHtml(meta)}</span>` : ""}</a></li>`;
	});
	return `<ul class="cards">${items.join("")}</ul>`;
};

// Runs right after the sidebar, so folders open or closed on an earlier page are the same
// before the first paint. The folder of the current page stays open.
const NAV_BOOT =
	"(function(){try{var s=JSON.parse(localStorage.getItem('spacefn-docs-nav')||'{}');document.querySelectorAll('#sidebar details[data-nav]:not([data-current])').forEach(function(e){var o=s[e.dataset.nav];if(o!==undefined)e.open=o})}catch(e){}})()";

// Runs in <head>, so the saved theme applies before the first paint.
const THEME_BOOT =
	"(function(){try{var t=localStorage.getItem('spacefn-docs-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()";

export const renderPage = (input: PageInput): string => {
	const { title, html, base, source, name } = input;
	const group = groupOf(input.tree, input.rel);
	const eyebrow = group ? `<div class="eyebrow">${escapeHtml(group)}</div>` : "";
	// The site's logo: the first doc set's (the app's), else the open one's.
	const logoUrl = input.sources[0]?.logo ?? source.logo;
	const logo = logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="" width="28" height="28">` : "";
	const next = pager(input);
	const foot = next ? `<footer class="page-foot">${next}</footer>` : "";
	const pageTitle = [name, `${name} docs`].includes(title)
		? `${name} docs`
		: `${title} · ${name} docs`;
	const config = JSON.stringify({ base, mermaid: input.mermaid ? MERMAID_URL : null }).replace(
		/</g,
		"\\u003c",
	);
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(pageTitle)}</title><script>${THEME_BOOT}</script><link rel="stylesheet" href="${base}${ASSETS}reader.css"></head><body>
<header class="topbar">
<button class="icon-btn menu-btn" type="button" aria-label="Toggle navigation" aria-controls="sidebar" aria-expanded="false">${ICONS.menu}</button>
<a class="brand" href="${input.sources[0]?.href ?? source.href}">${logo}<span>${escapeHtml(name)}</span><span class="brand-tag">docs</span></a>
<nav class="topbar-sources" aria-label="Doc sets">${input.sources.length > 1 ? sourceTabs(input) : ""}</nav>
<button class="topbar-search" type="button" aria-label="Search docs">${ICONS.search}<span>Search…</span><kbd>⌘K</kbd></button>
<button class="icon-btn theme-toggle" type="button" aria-label="Toggle dark mode">${ICONS.sun}${ICONS.moon}</button>
</header>
<div class="shell">${sidebar(input)}<main class="content">${eyebrow}<article class="prose">${html}</article>${foot}</main>${toc(input.toc)}</div>
<dialog class="search-dialog" aria-label="Search docs"><div class="search-field">${ICONS.search}<input type="search" placeholder="Search the docs" autocomplete="off" spellcheck="false"><kbd>esc</kbd></div><ul class="search-results" role="listbox"></ul></dialog>
<script type="application/json" id="docs-config">${config}</script><script type="module" src="${base}${ASSETS}reader.js"></script></body></html>`;
};
