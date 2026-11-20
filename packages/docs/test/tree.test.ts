import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { expect, test } from "vitest";

import { labelFromName, scanDocs } from "../src/tree.ts";

const docs = (files: Record<string, string>) => {
	const dir = mkdtempSync(join(tmpdir(), "space-docs-"));
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
	return dir;
};

test("orders index pages first, then by order, then by name; folders after pages", async () => {
	const dir = docs({
		"zeta.md": "# Zeta",
		"alpha.md": "# Alpha",
		"index.md": "# Home",
		"later.md": "---\norder: 99\n---\n# Later",
		"first.md": "---\norder: 1\n---\n# First",
		"2.second.md": "# Second",
		"guide/index.md": "---\norder: 1\n---\n# The guide",
		"guide/b.md": "# B",
		"api/a.md": "# A",
		"empty/notes.txt": "not a page",
		".hidden/x.md": "# Hidden",
	});
	const tree = await scanDocs(dir);
	expect(tree.map((node) => node.rel)).toEqual([
		"index.md",
		"first.md",
		"2.second.md",
		"later.md",
		"alpha.md",
		"zeta.md",
		"guide",
		"api",
	]);
	const guide = tree.find((node) => node.rel === "guide");
	expect(guide).toMatchObject({ kind: "dir", label: "The guide" });
	expect(tree.find((node) => node.rel === "api")).toMatchObject({ label: "Api" });
});

test("titles a page without a heading by its file name", async () => {
	const tree = await scanDocs(docs({ "1.getting-started.md": "No heading" }));
	expect(tree[0]).toMatchObject({ title: "Getting started", order: 1 });
	expect(labelFromName("my_notes.md")).toBe("My notes");
});
