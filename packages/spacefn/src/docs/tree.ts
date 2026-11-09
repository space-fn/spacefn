import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { slugger } from "./enhance";

export const DOCS_BASE = "/__space_docs/";

export type DocPage = {
	kind: "page";
	/** Path relative to docs/, using "/" separators. */
	rel: string;
	href: string;
	title: string;
	headings: { text: string; id: string }[];
};

export type DocDir = {
	kind: "dir";
	rel: string;
	href: string;
	label: string;
	children: DocNode[];
};

export type DocNode = DocPage | DocDir;

const INDEX_NAMES = ["index.md", "README.md"];

export function docHref(rel: string): string {
	if (!rel || rel === ".") return DOCS_BASE;
	return DOCS_BASE + rel.split("/").map(encodeURIComponent).join("/");
}

/** `1.getting-started` → `Getting started`. Numeric prefixes only set the order. */
export function labelFromName(name: string): string {
	const bare = name.replace(/\.md$/, "").replace(/^\d+\./, "");
	const words = bare.replace(/[-_]+/g, " ").trim();
	return words ? words[0]!.toUpperCase() + words.slice(1) : name;
}

function stripInline(text: string): string {
	return text
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/[`*_]/g, "")
		.trim();
}

/** Reads the first H1 and every H2 of a Markdown file, skipping fenced code. */
export function outline(md: string): { title: string | null; headings: string[] } {
	let title: string | null = null;
	const headings: string[] = [];
	let fence = false;
	for (const line of md.split(/\r?\n/)) {
		if (/^\s*(```|~~~)/.test(line)) {
			fence = !fence;
			continue;
		}
		if (fence) continue;
		const m = /^(#{1,2})\s+(.*?)(?:\s+#+\s*)?$/.exec(line);
		if (!m) continue;
		if (m[1] === "#" && title === null) title = stripInline(m[2]!);
		else if (m[1] === "##") headings.push(stripInline(m[2]!));
	}
	return { title, headings };
}

function byName(a: Dirent, b: Dirent): number {
	const ai = INDEX_NAMES.indexOf(a.name);
	const bi = INDEX_NAMES.indexOf(b.name);
	if (ai !== -1 || bi !== -1) return (ai === -1 ? 9 : ai) - (bi === -1 ? 9 : bi);
	return a.name.localeCompare(b.name, undefined, { numeric: true });
}

async function readPage(path: string, rel: string, fallback: string): Promise<DocPage> {
	let md = "";
	try {
		md = await readFile(path, "utf8");
	} catch {
		// unreadable pages still get a nav entry
	}
	const { title, headings } = outline(md);
	const slug = slugger();
	return {
		kind: "page",
		rel,
		href: docHref(rel),
		title: title ?? fallback,
		headings: headings.map((text) => ({ text, id: slug(text) })),
	};
}

async function walk(dir: string, prefix: string): Promise<DocNode[]> {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const visible = entries.filter((e) => !e.name.startsWith(".")).sort(byName);
	const files: DocNode[] = [];
	const dirs: DocNode[] = [];
	for (const e of visible) {
		const rel = prefix ? `${prefix}/${e.name}` : e.name;
		if (e.isFile() && e.name.endsWith(".md")) {
			files.push(await readPage(resolve(dir, e.name), rel, labelFromName(e.name)));
		} else if (e.isDirectory()) {
			const children = await walk(resolve(dir, e.name), rel);
			if (children.length) {
				// A folder's README/index title names its nav group ("API reference", not "Api reference").
				const home = children[0];
				const homeTitle =
					home?.kind === "page" && INDEX_NAMES.includes(home.rel.split("/").pop()!)
						? home.title
						: null;
				dirs.push({
					kind: "dir",
					rel,
					href: docHref(rel) + "/",
					label: homeTitle ?? labelFromName(e.name),
					children,
				});
			}
		}
	}
	return [...files, ...dirs];
}

export async function scanDocs(docsRoot: string): Promise<DocNode[]> {
	return walk(docsRoot, "");
}

export function flattenPages(nodes: DocNode[]): DocPage[] {
	const out: DocPage[] = [];
	for (const n of nodes) {
		if (n.kind === "page") out.push(n);
		else out.push(...flattenPages(n.children));
	}
	return out;
}

/** Names the nav group a page belongs to, for search results and the page eyebrow. */
export function groupOf(nodes: DocNode[], rel: string): string | null {
	for (const n of nodes) {
		if (n.kind === "dir" && (rel === n.rel || rel.startsWith(n.rel + "/"))) return n.label;
	}
	return null;
}
