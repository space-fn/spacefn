import { resolve, sep } from "node:path";

import { escapeHtml } from "../pages/html";
import { DOCS_CSS } from "./css";
import { renderMarkdown } from "./markdown";

export function createDocsReader(root: string) {
	const docsRoot = resolve(root, "docs");
	return async (
		req: { url?: string },
		res: {
			statusCode: number;
			setHeader: (k: string, v: string) => void;
			end: (b: string) => void;
		},
	) => {
		const url = (req.url ?? "/").split("?")[0] ?? "/";
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
		if (st.isDirectory()) {
			// Prefer README.md / index.md when present.
			for (const name of ["README.md", "index.md"]) {
				const candidate = resolve(target, name);
				if (candidate.startsWith(target + sep)) {
					try {
						const raw = await readFile(candidate, "utf8");
						const body = await renderMarkdown(raw);
						res.setHeader("Content-Type", "text/html; charset=utf-8");
						res.end(
							`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(rel || "docs")}</title><style>${DOCS_CSS}</style></head><body>${body}<hr><p><a href="/__space_docs/">← docs</a></p></body></html>`,
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
			res.setHeader("Content-Type", "text/html; charset=utf-8");
			res.end(
				`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(rel || "docs")}</title><style>${DOCS_CSS}</style></head><body><h1>/${escapeHtml(rel || "docs")}</h1><ul>${links}</ul></body></html>`,
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
		const body = target.endsWith(".md")
			? await renderMarkdown(raw)
			: `<pre>${escapeHtml(raw)}</pre>`;
		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res.end(
			`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(rel)}</title><style>${DOCS_CSS}</style></head><body>${body}<hr><p><a href="/__space_docs/">← docs</a></p></body></html>`,
		);
	};
}
