import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { createDocsReader } from "../src/docs/reader";

let root: string;
let handler: (req: any, res: any) => Promise<void>;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "space-docs-"));
	await mkdir(join(root, "docs"), { recursive: true });
	await writeFile(join(root, "docs", "hello.md"), "# Hello\n\nworld");
	handler = createDocsReader(root) as any;
});

afterEach(() => rm(root, { recursive: true, force: true }));

function makeRes() {
	const res: any = {
		statusCode: 200,
		headers: {} as Record<string, string>,
		body: "",
		setHeader(k: string, v: string) {
			this.headers[k] = v;
		},
		end(b: string) {
			this.body = b;
		},
	};
	return res;
}

test("renders a markdown file", async () => {
	const res = makeRes();
	await handler({ url: "/hello.md" }, res);
	expect(res.statusCode).toBe(200);
	expect(res.body).toContain("Hello");
});

test("escapes raw HTML in markdown", async () => {
	await writeFile(join(root, "docs", "unsafe.md"), "<script>alert(1)</script>");
	const res = makeRes();
	await handler({ url: "/unsafe.md" }, res);
	expect(res.body).not.toContain("<script>alert(1)</script>");
	expect(res.body).toContain("&lt;script&gt;");
});

test("returns 404 for missing file", async () => {
	const res = makeRes();
	await handler({ url: "/nope.md" }, res);
	expect(res.statusCode).toBe(404);
});

test("blocks traversal", async () => {
	const res = makeRes();
	await handler({ url: "/../package.json" }, res);
	expect(res.statusCode).toBe(403);
});

test("does not crash on undecodable bytes", async () => {
	await writeFile(join(root, "docs", "bin.dat"), Buffer.from([0x80, 0x81]));
	const res = makeRes();
	await handler({ url: "/bin.dat" }, res);
	expect(res.statusCode).toBe(200);
});

test("encodes link segments", async () => {
	await mkdir(join(root, "docs", "a b"), { recursive: true });
	await writeFile(join(root, "docs", "a b", "x.md"), "# x");
	const res = makeRes();
	await handler({ url: "/" }, res);
	expect(res.body).toContain("a%20b");
});

test("renders README.md for a directory", async () => {
	await mkdir(join(root, "docs", "sub"), { recursive: true });
	await writeFile(join(root, "docs", "sub", "README.md"), "# Sub home");
	const res = makeRes();
	await handler({ url: "/sub/" }, res);
	expect(res.statusCode).toBe(200);
	expect(res.body).toContain("Sub home");
});

test("renders a sidebar logo when provided", async () => {
	await writeFile(join(root, "docs", "logo.svg"), "<svg />");
	const res = makeRes();
	await handler({ url: "/" }, res);
	expect(res.statusCode).toBe(200);
	expect(res.body).toContain('class="brand"');
	expect(res.body).toContain("/__space_docs/logo.svg");
});

test("redirects a folder URL without a trailing slash", async () => {
	await mkdir(join(root, "docs", "sub"), { recursive: true });
	await writeFile(join(root, "docs", "sub", "index.md"), "# Sub");
	const res = makeRes();
	await handler({ url: "/sub", originalUrl: "/__space_docs/sub" }, res);
	expect(res.statusCode).toBe(302);
	expect(res.headers.Location).toBe("/__space_docs/sub/");
});

test("opens the only folder when docs/ just wraps one", async () => {
	await rm(join(root, "docs", "hello.md"));
	await mkdir(join(root, "docs", "guide"), { recursive: true });
	await writeFile(join(root, "docs", "guide", "index.md"), "# Guide");
	const res = makeRes();
	await handler({ url: "/", originalUrl: "/__space_docs/" }, res);
	expect(res.statusCode).toBe(302);
	expect(res.headers.Location).toBe("/__space_docs/guide/");
});

test("serves files under encoded paths", async () => {
	await mkdir(join(root, "docs", "a b"), { recursive: true });
	await writeFile(join(root, "docs", "a b", "x.md"), "# Spaced");
	const res = makeRes();
	await handler({ url: "/a%20b/x.md" }, res);
	expect(res.statusCode).toBe(200);
	expect(res.body).toContain("Spaced");
});

test("lists pages by their first heading and marks the current one", async () => {
	await writeFile(join(root, "docs", "other.md"), "# Another page\n\n## Setup");
	const res = makeRes();
	await handler({ url: "/hello.md" }, res);
	expect(res.body).toContain(">Another page</a>");
	expect(res.body).toMatch(/class="active" aria-current="page"><svg[\s\S]*?<\/svg>Hello</);
	expect(res.body).toContain('"headings":[{"text":"Setup","id":"setup"}]');
});

test("adds heading anchors and an on-this-page list", async () => {
	await writeFile(join(root, "docs", "toc.md"), "# T\n\n## First\n\n## Second\n\n### Deep");
	const res = makeRes();
	await handler({ url: "/toc.md" }, res);
	expect(res.body).toContain('id="first"');
	expect(res.body).toContain("On this page");
	expect(res.body).toContain('<li class="depth-3"><a href="#deep">Deep</a></li>');
});

test("links each page to the next one in nav order", async () => {
	await writeFile(join(root, "docs", "world.md"), "# World");
	const res = makeRes();
	await handler({ url: "/hello.md" }, res);
	expect(res.body).toMatch(/class="next" href="\/__space_docs\/world\.md"/);
});

test("serves images from docs/ as files", async () => {
	await writeFile(join(root, "docs", "pic.png"), Buffer.from([0x89, 0x50]));
	const res = makeRes();
	await handler({ url: "/pic.png" }, res);
	expect(res.headers["Content-Type"]).toBe("image/png");
	expect(Buffer.from(res.body)).toEqual(Buffer.from([0x89, 0x50]));
});
