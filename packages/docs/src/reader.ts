// Serves docs folders as a site: Markdown rendered per request, so edits show on reload,
// and the page reloads itself when a file changes.
import { type FSWatcher, watch } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import launchEditor from "launch-editor";

import { ASSETS, cards, pageHref, renderPage, type SourceView } from "./layout.ts";
import { escapeHtml, renderMarkdown, type Rendered } from "./markdown.ts";
import {
	findDir,
	flattenPages,
	groupOf,
	INDEX_NAMES,
	labelFromName,
	scanDocs,
	urlName,
	urlPath,
} from "./tree.ts";

/** A docs folder the reader serves. */
export interface DocsSource {
	/** Its name in the top bar, e.g. the app's name or `spacefn`. */
	readonly label: string;
	readonly dir: string;
	/** Its path under the reader's base: `""` for one source, else e.g. `spacefn/`. */
	readonly prefix: string;
	readonly version?: string;
	/** Where "Edit" goes for a page; by default the page opens in your editor. */
	readonly editUrl?: (rel: string) => string;
}

export interface ReaderOptions {
	/** The URL the reader is served at, e.g. `/` or `/__space/docs/`. */
	readonly base: string;
	readonly sources: readonly DocsSource[];
	/** The site's name in the top bar. */
	readonly name: string;
}

export interface Reader {
	/** A Node or Connect handler; `next` is called for URLs outside the base. */
	readonly handle: (req: IncomingMessage, res: ServerResponse, next?: () => void) => Promise<void>;
	/** Stops watching the docs folders. */
	readonly close: () => void;
}

/**
 * The file a URL path names, relative to `dir`: each segment is a name as it is,
 * or one with its order number left out (`pages.md` finds `2-pages.md`).
 */
const locate = async (dir: string, path: string): Promise<string | undefined> => {
	let rel = "";
	for (const segment of path.split("/").filter(Boolean)) {
		const names = await readdir(join(dir, rel)).catch(() => [] as string[]);
		const name = names.includes(segment)
			? segment
			: names.find((candidate) => urlName(candidate) === segment);
		if (name === undefined) return undefined;
		rel = rel ? `${rel}/${name}` : name;
	}
	return rel;
};

const ASSET_DIR = fileURLToPath(new URL("../assets/", import.meta.url));

const TYPES: Record<string, string> = {
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".ico": "image/x-icon",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".pdf": "application/pdf",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
};

const LOGOS = ["logo.svg", "logo.png", "logo.webp"];

const within = (dir: string, path: string) => path === dir || path.startsWith(dir + sep);

const exists = (path: string) =>
	stat(path).then(
		(s) => s,
		() => undefined,
	);

export const createReader = (options: ReaderOptions): Reader => {
	const base = options.base.endsWith("/") ? options.base : `${options.base}/`;
	// The longest prefix first, so `spacefn/` wins over the project's `""`.
	const sources = [...options.sources]
		.map((source) => ({ ...source, dir: resolve(source.dir) }))
		.sort((a, b) => b.prefix.length - a.prefix.length);
	const shown = options.sources.map((source) => sources.find((s) => s.prefix === source.prefix)!);
	const cache = new Map<string, { mtime: number; rendered: Rendered }>();
	const clients = new Set<ServerResponse>();
	let watchers: FSWatcher[] = [];

	const render = async (path: string): Promise<Rendered> => {
		const { mtimeMs } = await stat(path);
		const hit = cache.get(path);
		if (hit?.mtime === mtimeMs) return hit.rendered;
		const rendered = await renderMarkdown(await readFile(path, "utf8"));
		cache.set(path, { mtime: mtimeMs, rendered });
		return rendered;
	};

	const views = new Map<(typeof sources)[number], SourceView>();
	const viewOf = async (source: (typeof sources)[number]): Promise<SourceView> => {
		const known = views.get(source);
		if (known) return known;
		const href = base + source.prefix;
		let logo: string | null = null;
		for (const name of LOGOS) if (await exists(join(source.dir, name))) logo ??= href + name;
		const view = { label: source.label, href, version: source.version ?? null, logo };
		views.set(source, view);
		return view;
	};

	const send = (res: ServerResponse, status: number, type: string, body: string | Uint8Array) => {
		res.statusCode = status;
		res.setHeader("Content-Type", type);
		res.setHeader("Cache-Control", "no-cache");
		res.end(body);
	};

	const redirect = (res: ServerResponse, location: string) => {
		res.statusCode = 302;
		res.setHeader("Location", location);
		res.end();
	};

	const searchIndex = async () => {
		const entries = await Promise.all(
			sources.map(async (source) => {
				const view = await viewOf(source);
				const tree = await scanDocs(source.dir);
				return Promise.all(
					flattenPages(tree).map(async (page) => {
						const rendered = await render(join(source.dir, page.rel)).catch(() => undefined);
						return {
							source: source.label,
							title: page.title,
							href: pageHref(view, page.rel),
							group: groupOf(tree, page.rel),
							sections: (rendered?.sections ?? []).map((section) => ({
								...section,
								text: section.text.slice(0, 4000),
							})),
						};
					}),
				);
			}),
		);
		return entries.flat();
	};

	const events = (req: IncomingMessage, res: ServerResponse) => {
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		});
		res.write(": connected\n\n");
		clients.add(res);
		req.once("close", () => clients.delete(res));
		if (watchers.length > 0) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		watchers = sources.flatMap((source) => {
			try {
				return [
					watch(source.dir, { recursive: true }, () => {
						clearTimeout(timer);
						timer = setTimeout(() => {
							for (const client of clients) client.write("data: reload\n\n");
						}, 80);
					}),
				];
			} catch {
				return [];
			}
		});
	};

	const openInEditor = (res: ServerResponse, file: string | null) => {
		const path = file ? resolve(file) : "";
		if (!path || !sources.some((source) => within(source.dir, path)))
			return send(res, 403, "text/plain", "space docs: only files in the docs folders open");
		launchEditor(path);
		res.statusCode = 204;
		res.end();
	};

	const page = async (
		res: ServerResponse,
		source: (typeof sources)[number],
		rel: string,
		content: { title: string; html: string; rendered?: Rendered; file?: string },
		status = 200,
	) => {
		const view = await viewOf(source);
		const tree = await scanDocs(source.dir);
		const edit = content.file
			? source.editUrl
				? {
						href: source.editUrl(relative(source.dir, content.file).split(sep).join("/")),
						label: "Edit on GitHub",
					}
				: {
						href: `${base}${ASSETS}open?file=${encodeURIComponent(content.file)}`,
						label: "Edit this page",
					}
			: null;
		send(
			res,
			status,
			"text/html; charset=utf-8",
			renderPage({
				title: content.title,
				html: content.html,
				toc: content.rendered?.toc ?? [],
				mermaid: content.rendered?.mermaid ?? false,
				base,
				sources: await Promise.all(shown.map(viewOf)),
				source: view,
				tree,
				rel,
				edit,
				name: options.name,
			}),
		);
	};

	const notFound = async (
		res: ServerResponse,
		source: (typeof sources)[number] | undefined,
		rel: string,
	) => {
		if (!source) return send(res, 404, "text/plain", "not found");
		const view = await viewOf(source);
		await page(
			res,
			source,
			rel,
			{
				title: "Not found",
				html: `<h1>Not found</h1><p>There's no <code>${escapeHtml(rel)}</code> in ${escapeHtml(source.label)}'s docs. Go to <a href="${view.href}">the start</a>, or search.</p>`,
			},
			404,
		);
	};

	const handle: Reader["handle"] = async (req, res, next) => {
		// Connect strips its mount from `url` and keeps the full one in `originalUrl`.
		const full = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url;
		const url = new URL(full ?? "/", "http://localhost");
		let path: string;
		try {
			path = decodeURIComponent(url.pathname);
		} catch {
			return send(res, 400, "text/plain", "bad request");
		}
		if (`${path}/` === base) return redirect(res, base);
		if (!path.startsWith(base)) return next ? next() : send(res, 404, "text/plain", "not found");
		const rest = path.slice(base.length);

		if (rest.startsWith(ASSETS)) {
			const name = rest.slice(ASSETS.length);
			if (name === "search.json")
				return send(res, 200, TYPES[".json"]!, JSON.stringify(await searchIndex()));
			if (name === "events") return events(req, res);
			if (name === "open") return openInEditor(res, url.searchParams.get("file"));
			if (name === "reader.css" || name === "reader.js")
				return send(res, 200, TYPES[extname(name)]!, await readFile(join(ASSET_DIR, name)));
			return send(res, 404, "text/plain", "not found");
		}

		const source = sources.find((s) => rest.startsWith(s.prefix) || `${rest}/` === s.prefix);
		if (!source) return redirect(res, base + (shown[0]?.prefix ?? ""));
		if (`${rest}/` === source.prefix) return redirect(res, base + source.prefix);
		const asked = rest.slice(source.prefix.length).replace(/\/+$/, "");
		if (!within(source.dir, resolve(source.dir, asked)))
			return send(res, 403, "text/plain", "forbidden");
		const rel = (await locate(source.dir, asked)) ?? asked;
		const target = resolve(source.dir, rel);

		const found = await exists(target);
		// A link by file name, `2-pages.md`, goes to the page's URL, `pages.md`.
		if (found && urlPath(rel) !== asked)
			return redirect(
				res,
				pageHref(await viewOf(source), rel) + (found.isDirectory() ? "/" : "") + url.search,
			);
		if (!found) {
			// No docs of its own: the reader opens on the next source.
			if (rel === "" && source !== shown.at(-1)) return redirect(res, base + shown.at(-1)!.prefix);
			return notFound(res, source, rel);
		}

		if (found.isDirectory()) {
			// Relative links in a page only resolve against a folder URL that ends in `/`.
			if (rel && !rest.endsWith("/"))
				return redirect(res, `${pageHref(await viewOf(source), rel)}/`);
			for (const name of INDEX_NAMES) {
				const file = join(target, name);
				if (!(await exists(file))) continue;
				const rendered = await render(file);
				return page(res, source, rel ? `${rel}/${name}` : name, {
					title: rendered.title ?? labelFromName(rel.split("/").pop() || source.label),
					html: rendered.html,
					rendered,
					file,
				});
			}
			const tree = await scanDocs(source.dir);
			const dir = rel ? findDir(tree, rel) : undefined;
			const label = dir?.label ?? source.label;
			return page(res, source, rel, {
				title: label,
				html: `<h1>${escapeHtml(label)}</h1>${cards(await viewOf(source), dir?.children ?? tree)}`,
			});
		}

		if (target.endsWith(".md")) {
			const rendered = await render(target);
			return page(res, source, rel, {
				title: rendered.title ?? labelFromName(rel.split("/").pop()!),
				html: rendered.html,
				rendered,
				file: target,
			});
		}
		const type = TYPES[extname(target).toLowerCase()];
		if (type) return send(res, 200, type, await readFile(target));
		return notFound(res, source, rel);
	};

	return {
		handle: (req, res, next) =>
			handle(req, res, next).catch((error: unknown) => {
				if (!res.headersSent)
					send(
						res,
						500,
						"text/plain; charset=utf-8",
						`space docs: ${error instanceof Error ? error.stack : String(error)}`,
					);
			}),
		close: () => {
			for (const watcher of watchers) watcher.close();
			for (const client of clients) client.end();
			watchers = [];
			clients.clear();
		},
	};
};
