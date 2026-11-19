import type { Stats } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { escapeHtml } from "../pages/html";
import { enhance } from "./enhance";
import { type Brand, renderCards, renderPage } from "./layout";
import { renderMarkdown } from "./markdown";
import {
	DOCS_BASE,
	type DocDir,
	type DocNode,
	docHref,
	labelFromName,
	outline,
	scanDocs,
} from "./tree";

const ASSET_TYPES: Record<string, string> = {
	svg: "image/svg+xml",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	ico: "image/x-icon",
	css: "text/css; charset=utf-8",
	js: "application/javascript; charset=utf-8",
	json: "application/json; charset=utf-8",
};

const LOGO_NAMES = ["logo.svg", "logo.png", "logo.webp", "logo.jpg", "logo.jpeg"];

function assetType(path: string): string | null {
	return ASSET_TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

type Res = {
	statusCode: number;
	setHeader: (k: string, v: string) => void;
	end: (b: string | Uint8Array) => void;
};

function findDir(nodes: DocNode[], rel: string): DocDir | null {
	for (const n of nodes) {
		if (n.kind !== "dir") continue;
		if (n.rel === rel) return n;
		if (rel.startsWith(n.rel + "/")) return findDir(n.children, rel);
	}
	return null;
}

async function readBrand(root: string, docsRoot: string, tree: DocNode[]): Promise<Brand> {
	let logo: string | null = null;
	for (const name of LOGO_NAMES) {
		if ((await exists(resolve(docsRoot, name))) || (await exists(resolve(root, name)))) {
			logo = DOCS_BASE + name;
			break;
		}
	}
	// docs/README.md or docs/index.md names the site; otherwise the package does.
	const home = tree.find((n) => n.kind === "page" && /^(index|README)\.md$/.test(n.rel));
	if (home?.kind === "page") return { name: home.title, logo };
	let name = "Docs";
	try {
		const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
			name?: string;
		};
		if (pkg.name) name = pkg.name;
	} catch {
		// no package.json
	}
	return { name, logo };
}

export function createDocsReader(root: string) {
	const docsRoot = resolve(root, "docs");
	return async (req: { url?: string; originalUrl?: string }, res: Res) => {
		let url = (req.url ?? "/").split("?")[0] ?? "/";
		try {
			url = decodeURIComponent(url);
		} catch {
			res.statusCode = 400;
			res.end("bad request");
			return;
		}
		const rel = url.replace(/^\/+/, "").replace(/\/+$/, "");
		const target = resolve(docsRoot, rel || ".");
		if (target !== docsRoot && !target.startsWith(docsRoot + sep)) {
			res.statusCode = 403;
			res.end("forbidden");
			return;
		}

		let st: Stats | null = null;
		try {
			st = await stat(target);
		} catch {
			// a logo kept next to docs/ is served from the app root
			if (LOGO_NAMES.includes(rel) && (await exists(resolve(root, rel)))) {
				res.setHeader("Content-Type", assetType(rel)!);
				res.end(await readFile(resolve(root, rel)));
				return;
			}
			res.statusCode = 404;
			res.end("not found");
			return;
		}

		const type = st.isFile() ? assetType(target) : null;
		if (type) {
			res.setHeader("Content-Type", type);
			res.end(await readFile(target));
			return;
		}

		// Relative links in Markdown only resolve against a folder URL that ends in "/".
		const original = (req.originalUrl ?? "").split("?")[0] ?? "";
		const redirect = (location: string) => {
			res.statusCode = 302;
			res.setHeader("Location", location);
			res.end("");
		};
		if (st.isDirectory() && (original ? !original.endsWith("/") : rel && !url.endsWith("/"))) {
			redirect(rel ? docHref(rel) + "/" : DOCS_BASE);
			return;
		}

		const tree = await scanDocs(docsRoot);
		const brand = await readBrand(root, docsRoot, tree);
		// The nav marks this path as current: a folder's README/index page, or the file itself.
		let current = rel;
		const send = (title: string, html: string, source: string | null) => {
			const { html: body, toc } = enhance(html);
			res.setHeader("Content-Type", "text/html; charset=utf-8");
			res.end(renderPage({ title, body, toc, rel: current, source, tree, brand }));
		};

		if (st.isDirectory()) {
			for (const name of ["README.md", "index.md"]) {
				const file = resolve(target, name);
				let raw: string;
				try {
					raw = await readFile(file, "utf8");
				} catch {
					continue;
				}
				current = rel ? `${rel}/${name}` : name;
				send(
					outline(raw).title ?? labelFromName(rel.split("/").pop() || "docs"),
					await renderMarkdown(raw),
					file,
				);
				return;
			}
			const dir = rel ? findDir(tree, rel) : null;
			const children = dir ? dir.children : tree;
			const label = dir?.label ?? "Documentation";
			send(
				label,
				`<h1>${escapeHtml(label)}</h1><p>${children.length} entries in <code>docs/${escapeHtml(rel)}</code></p>${renderCards(children)}`,
				null,
			);
			return;
		}

		const raw = await readFile(target, "utf8");
		if (target.endsWith(".md")) {
			send(
				outline(raw).title ?? labelFromName(rel.split("/").pop()!),
				await renderMarkdown(raw),
				target,
			);
		} else {
			const name = rel.split("/").pop()!;
			send(name, `<h1>${escapeHtml(name)}</h1><pre><code>${escapeHtml(raw)}</code></pre>`, target);
		}
	};
}
