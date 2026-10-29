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
