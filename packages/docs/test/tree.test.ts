import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { expect, test } from "vitest";

import { flattenPages, iconName, labelFromName, scanDocs, urlPath } from "../src/tree.ts";

const docs = (files: Record<string, string>) => {
	const dir = mkdtempSync(join(tmpdir(), "space-docs-"));
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
	return dir;
};

test("orders index pages first, then by order with folders among pages, then pages before folders, then by name", async () => {
	const dir = docs({
		"zeta.md": "# Zeta",
		"alpha.md": "# Alpha",
		"index.md": "# Home",
		"later.md": "---\norder: 99\n---\n# Later",
		"first.md": "---\norder: 1\n---\n# First",
		"2-second.md": "# Second",
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
		"guide",
		"2-second.md",
		"later.md",
		"alpha.md",
		"zeta.md",
		"api",
	]);
	const guide = tree.find((node) => node.rel === "guide");
	expect(guide).toMatchObject({ kind: "dir", label: "The guide" });
	expect(tree.find((node) => node.rel === "api")).toMatchObject({ label: "Api" });
});

test("takes a Tabler icon from frontmatter, and gives a folder its index page's", async () => {
	const tree = await scanDocs(
		docs({
			"start.md": "---\nicon: rocket\n---\n# Start",
			"plain.md": "# Plain",
			"guide/index.md": "---\nicon: tabler-book\n---\n# Guide",
			"guide/a.md": "# A",
		}),
	);
	expect(tree.find((node) => node.rel === "start.md")).toMatchObject({ icon: "rocket" });
	expect(tree.find((node) => node.rel === "plain.md")).toMatchObject({ icon: null });
	expect(tree.find((node) => node.rel === "guide")).toMatchObject({ icon: "book" });
	expect(iconName("Heart-Filled")).toBe("heart-filled");
	expect(iconName('x)" onload')).toBeNull();
	expect(iconName("")).toBeNull();
});

test("titles a page without a heading by its file name", async () => {
	const tree = await scanDocs(docs({ "1-getting-started.md": "No heading" }));
	expect(tree[0]).toMatchObject({ title: "Getting started", order: 1 });
	expect(labelFromName("my_notes.md")).toBe("My notes");
});

test("orders by a number before the name, which URLs leave out", async () => {
	const tree = await scanDocs(
		docs({
			"2-routes.md": "# Routes",
			"10-deploy.md": "# Deploy",
			"1-start.md": "# Start",
			"3-guides/1-pages.md": "# Pages",
			"0.5.md": "# Release notes",
		}),
	);
	expect(flattenPages(tree).map((page) => urlPath(page.rel))).toEqual([
		"start.md",
		"routes.md",
		"guides/pages.md",
		"deploy.md",
		"0.5.md",
	]);
	expect(tree.find((node) => node.kind === "dir")).toMatchObject({ label: "Guides", order: 3 });
});
