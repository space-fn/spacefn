import { resolve, sep } from "node:path";

import { escapeHtml } from "../pages/html";
import { DOCS_CSS } from "./css";
import { renderMarkdown } from "./markdown";

function getAssetMimeType(filePath: string): string | null {
	const ext = filePath.split(".").pop()?.toLowerCase();
	switch (ext) {
		case "svg":
			return "image/svg+xml";
		case "png":
			return "image/png";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "gif":
			return "image/gif";
		case "webp":
			return "image/webp";
		case "ico":
			return "image/x-icon";
		case "css":
			return "text/css; charset=utf-8";
		case "js":
			return "application/javascript; charset=utf-8";
		case "json":
			return "application/json; charset=utf-8";
		default:
			return null;
	}
}

async function findBrandAsset(docsRoot: string): Promise<string | null> {
	const { access } = await import("node:fs/promises");
	for (const candidate of [
		resolve(docsRoot, "logo.svg"),
		resolve(docsRoot, "logo.png"),
		resolve(docsRoot, "logo.webp"),
		resolve(docsRoot, "logo.jpg"),
		resolve(docsRoot, "logo.jpeg"),
		resolve(docsRoot, "..", "logo.svg"),
		resolve(docsRoot, "..", "logo.png"),
		resolve(docsRoot, "..", "logo.webp"),
		resolve(docsRoot, "..", "logo.jpg"),
		resolve(docsRoot, "..", "logo.jpeg"),
	]) {
		try {
			await access(candidate);
			return candidate;
		} catch {
			// keep looking
		}
	}
	return null;
}

async function buildNav(docsRoot: string, currentRel: string): Promise<string> {
	const { readdir } = await import("node:fs/promises");
	const brandPath = await findBrandAsset(docsRoot);
	const brand = brandPath
		? `<div class="sidebar-brand"><a href="/__space_docs/"><img src="/__space_docs/${encodeURIComponent(brandPath.split("/").pop() ?? "logo.svg")}" alt="Project docs logo" width="64" height="64" /></a></div>`
		: "";
	async function walk(dir: string, prefix: string): Promise<string> {
		let entries: import("node:fs").Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return "";
		}
		const dirs = entries
			.filter((e) => e.isDirectory() && !e.name.startsWith("."))
			.sort((a, b) => a.name.localeCompare(b.name));
		const files = entries
			.filter((e) => e.isFile() && !e.name.startsWith(".") && e.name.endsWith(".md"))
			.sort((a, b) => a.name.localeCompare(b.name));
		let html = "<ul>";
		for (const f of files) {
			const name = f.name.replace(/\.md$/, "");
			const rel = prefix ? prefix + "/" + f.name : f.name;
			const href = "/__space_docs/" + rel.split("/").map(encodeURIComponent).join("/");
			const active = rel === currentRel ? ' class="active"' : "";
			html += `<li><a href="${href}"${active}>${escapeHtml(name === "index" ? prefix.split("/").pop() || "index" : name)}</a></li>`;
		}
		for (const d of dirs) {
			const subPrefix = prefix ? prefix + "/" + d.name : d.name;
			const sub = await walk(resolve(dir, d.name), subPrefix);
			html += `<li><details open><summary class="nav-dir">${escapeHtml(d.name)}</summary>${sub}</details></li>`;
		}
		html += "</ul>";
		return html;
	}
	const nav = await walk(docsRoot, "");
	return `<nav class="sidebar">${brand}${nav}</nav>`;
}

export function createDocsReader(root: string) {
	const docsRoot = resolve(root, "docs");
	const toggleScript =
		"<script>(function(){var k='spacefn-docs-theme';var b=document.body;function apply(t){b.classList.toggle('dark',t==='dark');}var s=localStorage.getItem(k);if(s)apply(s);else if(matchMedia('(prefers-color-scheme:dark)').matches)apply('dark');document.querySelector('.theme-toggle')?.addEventListener('click',function(){var n=b.classList.contains('dark')?'light':'dark';apply(n);localStorage.setItem(k,n);});})();</script>";
	return async (
		req: { url?: string },
		res: {
			statusCode: number;
			setHeader: (k: string, v: string) => void;
			end: (b: string) => void;
		},
	) => {
		const url = (req.url ?? "/").split("?")[0] ?? "/";
		if (
			url === "/logo.svg" ||
			url === "/logo.png" ||
			url === "/logo.webp" ||
			url === "/logo.jpg" ||
			url === "/logo.jpeg"
		) {
			for (const basename of ["logo.svg", "logo.png", "logo.webp", "logo.jpg", "logo.jpeg"]) {
				for (const baseDir of [docsRoot, resolve(docsRoot, "..")]) {
					try {
						const fullPath = resolve(baseDir, basename);
						const { readFile, stat } = await import("node:fs/promises");
						await stat(fullPath);
						const mimeType = getAssetMimeType(basename) ?? "application/octet-stream";
						res.setHeader("Content-Type", mimeType);
						res.end((await readFile(fullPath)).toString("binary"));
						return;
					} catch {
						// continue to next candidate
					}
				}
			}
		}
		const rel = url.replace(/^\/+/, "");
		const target = resolve(docsRoot, rel || ".");
		if (target !== docsRoot && !target.startsWith(docsRoot + sep)) {
			res.statusCode = 403;
			res.end("forbidden");
			return;
		}
		const { stat, readdir, readFile } = await import("node:fs/promises");
		let st: import("node:fs").Stats;
		try {
			st = await stat(target);
		} catch {
			res.statusCode = 404;
			res.end("not found");
			return;
		}
		const crumbs = (rel ? rel.split("/") : [])
			.map((part, i, arr) => {
				const href =
					"/__space_docs/" +
					arr
						.slice(0, i + 1)
						.map(encodeURIComponent)
						.join("/");
				return `<a href="${href}">${escapeHtml(part)}</a>`;
			})
			.join(" / ");
		const breadcrumb = `<nav class="crumbs"><a href="/__space_docs/">docs</a>${crumbs ? " / " + crumbs : ""}</nav>`;
		const toggle = `<button class="theme-toggle" type="button">theme</button>`;
		if (st.isDirectory()) {
			for (const name of ["README.md", "index.md"]) {
				const candidate = resolve(target, name);
				if (candidate.startsWith(target + sep)) {
					try {
						const raw = await readFile(candidate, "utf8");
						const body = await renderMarkdown(raw);
						const sidebar = await buildNav(docsRoot, rel || ".");
						res.setHeader("Content-Type", "text/html; charset=utf-8");
						res.end(
							`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(rel || "docs")}</title><style>${DOCS_CSS}</style></head><body>${toggle}<div class="layout">${sidebar}<main>${breadcrumb}${body}<hr><p><a href="/__space_docs/">← docs</a></p></main></div>${toggleScript}</body></html>`,
						);
						return;
					} catch {
						// fall through to listing
					}
				}
			}
			const entries = (await readdir(target, { withFileTypes: true }))
				.filter((e) => !e.name.startsWith("."))
				.sort((a, b) => a.name.localeCompare(b.name));
			const links = entries
				.map((e) => {
					const href =
						"/__space_docs/" +
						(rel ? rel.split("/").map(encodeURIComponent).join("/") + "/" : "") +
						encodeURIComponent(e.name);
					return `<li><a href="${href}">${escapeHtml(e.name)}${e.isDirectory() ? "/" : ""}</a></li>`;
				})
				.join("");
			const sidebar = await buildNav(docsRoot, rel || ".");
			res.setHeader("Content-Type", "text/html; charset=utf-8");
			res.end(
				`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(rel || "docs")}</title><style>${DOCS_CSS}</style></head><body>${toggle}<div class="layout">${sidebar}<main>${breadcrumb}<h1>/${escapeHtml(rel || "docs")}</h1><ul>${links}</ul></main></div>${toggleScript}</body></html>`,
			);
			return;
		}
		let raw: string;
		try {
			raw = await readFile(target, "utf8");
		} catch {
			res.statusCode = 415;
			res.end("unsupported media type");
			return;
		}
		// prev/next siblings
		let prevNext = "";
		try {
			const parent = resolve(target, "..");
			const siblings = (await readdir(parent, { withFileTypes: true }))
				.filter((e) => !e.name.startsWith(".") && e.isFile() && e.name.endsWith(".md"))
				.map((e) => e.name)
				.sort((a, b) => a.localeCompare(b));
			const idx = siblings.indexOf(rel.split("/").pop() ?? "");
			const prev = idx > 0 ? siblings[idx - 1] : null;
			const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
			const parts: string[] = [];
			if (prev) {
				const href =
					"/__space_docs/" +
					rel.split("/").slice(0, -1).concat(prev).map(encodeURIComponent).join("/");
				parts.push(`<a href="${href}">← ${escapeHtml(prev)}</a>`);
			}
			if (next) {
				const href =
					"/__space_docs/" +
					rel.split("/").slice(0, -1).concat(next).map(encodeURIComponent).join("/");
				parts.push(`<a href="${href}">${escapeHtml(next)} →</a>`);
			}
			if (parts.length) prevNext = `<hr><p>${parts.join(" · ")}</p>`;
		} catch {
			// ignore
		}
		const body = target.endsWith(".md")
			? await renderMarkdown(raw)
			: `<pre>${escapeHtml(raw)}</pre>`;
		const sidebar = await buildNav(docsRoot, rel);
		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res.end(
			`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(rel)}</title><style>${DOCS_CSS}</style></head><body>${toggle}<div class="layout">${sidebar}<main>${breadcrumb}${body}${prevNext}<hr><p><a href="/__space_docs/">← docs</a></p></main></div>${toggleScript}</body></html>`,
		);
	};
}
