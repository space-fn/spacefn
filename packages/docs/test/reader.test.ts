import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { serve, version } from "../src/index.ts";

const app = (files: Record<string, string>) => {
	const root = mkdtempSync(join(tmpdir(), "space-docs-app-"));
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	return root;
};

const get = (url: string) => fetch(url, { redirect: "manual" });

describe("an app with docs/", () => {
	let server: Awaited<ReturnType<typeof serve>>;
	beforeAll(async () => {
		const root = app({
			"package.json": '{"name":"todo-app"}',
			"docs/index.md": "# Todo app\n\nSee [deploys](runbooks/deploys.md).\n",
			"docs/runbooks/deploys.md":
				"---\nicon: rocket\n---\n# Deploys\n\n## Rolling back\n\nRun it.\n",
			"docs/runbooks/notes.md": "# Notes\n",
			"docs/logo.svg": "<svg/>",
			"secret.md": "# Outside docs/",
		});
		server = await serve({ root, port: 0 });
	});
	afterAll(() => server.close());

	test("opens on the app's home page, with both doc sets in the top bar", async () => {
		const response = await get(server.url);
		const html = await response.text();
		expect(response.status).toBe(200);
		expect(html).toContain("<title>Todo app · todo-app docs</title>");
		expect(html).toContain('<a class="source-tab active" href="/">todo-app</a>');
		expect(html).toContain(`href="/spacefn/">spacefn<span class="version">v${version}</span>`);
		expect(html).toContain('<img src="/logo.svg"');
	});

	test("renders a page with the sidebar, the outline and the pager", async () => {
		const html = await (await get(`${server.url}runbooks/deploys.md`)).text();
		expect(html).toContain('<div class="eyebrow">Runbooks</div>');
		expect(html).toContain('<h2 id="rolling-back">');
		expect(html).toContain('<a class="next" href="/runbooks/notes.md">');
		expect(html).not.toContain("edit-link");
		// Its frontmatter icon, from Tabler; a page without one has none.
		expect(html).toContain(
			'class="active" aria-current="page"><span class="nav-icon" style="--icon:url(https://cdn.jsdelivr.net/npm/@tabler/icons@3.50.0/icons/outline/rocket.svg)" aria-hidden="true"></span>Deploys</a>',
		);
		expect(html).toContain('<a href="/runbooks/notes.md">Notes</a>');
		// Its folder is a collapsible group, open because the page is in it.
		expect(html).toContain(
			'<details class="nav-group" open data-current data-nav="/runbooks"><summary class="nav-group-title">Runbooks</summary>',
		);
	});

	test("lists a folder without an index page as cards, at its URL with a slash", async () => {
		const redirect = await get(`${server.url}runbooks`);
		expect(redirect.status).toBe(302);
		expect(redirect.headers.get("location")).toBe("/runbooks/");
		const html = await (await get(`${server.url}runbooks/`)).text();
		expect(html).toContain('<ul class="cards">');
		expect(html).toContain('href="/runbooks/notes.md"');
	});

	test("serves spacefn's docs under spacefn/", async () => {
		const html = await (await get(`${server.url}spacefn/reference/writing-docs.md`)).text();
		expect(html).toContain('class="source-tab active" href="/spacefn/"');
		expect(html).toContain('<div class="code-group">');
		expect(html).toContain('"mermaid":"https://cdn.jsdelivr.net/npm/mermaid@');
	});

	test("serves images, the reader's own files and the search index", async () => {
		expect((await get(`${server.url}logo.svg`)).headers.get("content-type")).toBe("image/svg+xml");
		expect((await get(`${server.url}_/reader.css`)).status).toBe(200);
		expect((await get(`${server.url}_/reader.js`)).headers.get("content-type")).toContain(
			"javascript",
		);
		const index = (await (await get(`${server.url}_/search.json`)).json()) as {
			source: string;
			href: string;
			sections: { id: string | null }[];
		}[];
		const deploys = index.find((page) => page.href === "/runbooks/deploys.md");
		expect(deploys?.source).toBe("todo-app");
		expect(deploys?.sections.map((section) => section.id)).toEqual([null, "rolling-back"]);
		expect(index.some((page) => page.href === "/spacefn/reference/writing-docs.md")).toBe(true);
	});

	test("answers 404 inside the reader, and refuses paths out of docs/", async () => {
		const missing = await get(`${server.url}nope.md`);
		expect(missing.status).toBe(404);
		expect(await missing.text()).toContain("<h1>Not found</h1>");
		expect((await get(`${server.url}..%2Fsecret.md`)).status).toBe(403);
	});
});

describe("numbered docs", () => {
	let server: Awaited<ReturnType<typeof serve>>;
	beforeAll(async () => {
		const root = app({
			"package.json": '{"name":"shop"}',
			"docs/index.md": "# Shop\n\nRead [setup](1-setup.md) and [the guides](2-guides/).\n",
			"docs/1-setup.md": "# Setup\n",
			"docs/2-guides/1-orders.md": "# Orders\n",
		});
		server = await serve({ root, port: 0 });
	});
	afterAll(() => server.close());

	test("serves pages and folders at URLs without the number", async () => {
		const html = await (await get(server.url)).text();
		expect(html).toContain('href="/setup.md"');
		expect(html).toContain('href="/guides/orders.md"');
		expect(await (await get(`${server.url}guides/orders.md`)).text()).toContain("<h1");
	});

	test("sends a link by file name to the page's URL", async () => {
		const page = await get(`${server.url}1-setup.md`);
		expect([page.status, page.headers.get("location")]).toEqual([302, "/setup.md"]);
		const folder = await get(`${server.url}2-guides/1-orders.md?q=1`);
		expect(folder.headers.get("location")).toBe("/guides/orders.md?q=1");
		const dir = await get(`${server.url}2-guides/`);
		expect(dir.headers.get("location")).toBe("/guides/");
	});
});

test("an app without docs/ opens on spacefn's docs", async () => {
	const server = await serve({ root: app({ "package.json": '{"name":"bare"}' }), port: 0 });
	try {
		const html = await (await get(server.url)).text();
		expect(html).toContain("<title>Introduction · spacefn docs</title>");
		expect(html).not.toContain("source-tab");
	} finally {
		await server.close();
	}
});
