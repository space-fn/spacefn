// The sidebar: a docs folder's Markdown pages and subfolders, in reading order.
import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { frontmatter } from "./markdown.ts";

export interface DocPage {
	readonly kind: "page";
	/** Path relative to the docs folder, with `/` separators. */
	readonly rel: string;
	readonly title: string;
	readonly description: string | null;
	readonly order: number;
}

export interface DocDir {
	readonly kind: "dir";
	readonly rel: string;
	readonly label: string;
	readonly order: number;
	readonly children: readonly DocNode[];
}

export type DocNode = DocPage | DocDir;

export const INDEX_NAMES = ["index.md", "README.md"];

export const isIndex = (rel: string) => INDEX_NAMES.includes(rel.split("/").pop()!);

/** A number before a name, `2-pages.md`, orders it in the sidebar; URLs and labels leave it out. */
const ORDER_PREFIX = /^(\d+)-/;

/** A file or folder's name in URLs: `2-pages.md` → `pages.md`. */
export const urlName = (name: string): string => name.replace(ORDER_PREFIX, "");

/** A path in URLs: `3-guides/2-pages.md` → `guides/pages.md`. */
export const urlPath = (rel: string): string => rel.split("/").map(urlName).join("/");

/** `1-getting-started.md` → `Getting started`. */
export const labelFromName = (name: string): string => {
	const words = urlName(name).replace(/\.md$/, "").replace(/[-_]+/g, " ").trim();
	return words ? words[0]!.toUpperCase() + words.slice(1) : name;
};

const stripInline = (text: string) =>
	text
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/[`*_]/g, "")
		.trim();

/** The page's title: frontmatter `title`, else its first `# heading`, skipping code fences. */
export const titleOf = (body: string): string | null => {
	let fence = false;
	for (const line of body.split(/\r?\n/)) {
		if (/^\s*(```|~~~)/.test(line)) fence = !fence;
		else if (!fence) {
			const match = /^#\s+(.*?)(?:\s+#+\s*)?$/.exec(line);
			if (match) return stripInline(match[1]!);
		}
	}
	return null;
};

const prefixOrder = (name: string) => {
	const match = ORDER_PREFIX.exec(name);
	return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
};

/**
 * Index pages first, then `order` (frontmatter or a numeric prefix), so a
 * numbered folder sits among the pages at its number; then pages before
 * folders, then name.
 */
const byOrder = (a: DocNode, b: DocNode) => {
	const ai = isIndex(a.rel) ? 0 : 1;
	const bi = isIndex(b.rel) ? 0 : 1;
	if (ai !== bi) return ai - bi;
	if (a.order !== b.order) return a.order - b.order;
	if (a.kind !== b.kind) return a.kind === "page" ? -1 : 1;
	return a.rel.localeCompare(b.rel, undefined, { numeric: true });
};

const readPage = async (path: string, rel: string, name: string): Promise<DocPage> => {
	const source = await readFile(path, "utf8").catch(() => "");
	const { data, body } = frontmatter(source);
	const order = Number(data.order);
	return {
		kind: "page",
		rel,
		title: data.title ?? titleOf(body) ?? labelFromName(name),
		description: data.description ?? null,
		order: Number.isFinite(order) ? order : prefixOrder(name),
	};
};

const walk = async (dir: string, prefix: string): Promise<DocNode[]> => {
	const entries: Dirent[] = await readdir(dir, { withFileTypes: true }).catch(() => []);
	const nodes = await Promise.all(
		entries
			.filter((entry) => !entry.name.startsWith(".") && entry.name !== "node_modules")
			.map(async (entry): Promise<DocNode | undefined> => {
				const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
				const path = join(dir, entry.name);
				if (entry.isFile() && entry.name.endsWith(".md")) return readPage(path, rel, entry.name);
				if (!entry.isDirectory()) return undefined;
				const children = await walk(path, rel);
				if (children.length === 0) return undefined;
				// A folder's index page names and orders its group.
				const home =
					children[0]!.kind === "page" && isIndex(children[0]!.rel) ? children[0] : undefined;
				return {
					kind: "dir",
					rel,
					label: home?.kind === "page" ? home.title : labelFromName(entry.name),
					order: home && Number.isFinite(home.order) ? home.order : prefixOrder(entry.name),
					children,
				};
			}),
	);
	return nodes.filter((node) => node !== undefined).sort(byOrder);
};

export const scanDocs = (dir: string): Promise<DocNode[]> => walk(dir, "");

export const flattenPages = (nodes: readonly DocNode[]): DocPage[] =>
	nodes.flatMap((node) => (node.kind === "page" ? [node] : flattenPages(node.children)));

export const findDir = (nodes: readonly DocNode[], rel: string): DocDir | undefined => {
	for (const node of nodes) {
		if (node.kind !== "dir") continue;
		if (node.rel === rel) return node;
		if (rel.startsWith(`${node.rel}/`)) return findDir(node.children, rel);
	}
	return undefined;
};

/** The top-level group a page is in, for search results and the eyebrow above its title. */
export const groupOf = (nodes: readonly DocNode[], rel: string): string | null => {
	for (const node of nodes)
		if (node.kind === "dir" && rel.startsWith(`${node.rel}/`)) return node.label;
	return null;
};
