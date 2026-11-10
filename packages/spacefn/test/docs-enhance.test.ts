import { expect, test } from "vite-plus/test";

import { addCallouts, addHeadingAnchors, slugger } from "../src/docs/enhance";
import { labelFromName, outline } from "../src/docs/tree";

test("slugger suffixes repeated headings", () => {
	const slug = slugger();
	expect([slug("Set up"), slug("Set up"), slug("`ctx.env`!")]).toEqual([
		"set-up",
		"set-up-1",
		"ctxenv",
	]);
});

test("addHeadingAnchors collects h2 and h3 only", () => {
	const { html, toc } = addHeadingAnchors("<h2>A &amp; B</h2><h3>C</h3><h4>D</h4>");
	expect(toc).toEqual([
		{ depth: 2, text: "A & B", id: "a-b" },
		{ depth: 3, text: "C", id: "c" },
	]);
	expect(html).toContain('<h4 id="d">');
});

test("addCallouts styles GitHub alert blockquotes", () => {
	const html = addCallouts("<blockquote>\n<p>[!WARNING]\nCareful</p>\n</blockquote>");
	expect(html).toContain('class="callout callout-warning"');
	expect(html).toContain('<p class="callout-title">Warning</p><p>Careful</p>');
});

test("outline skips headings inside code fences", () => {
	expect(outline("```md\n# Not me\n```\n# Title\n## One\n```\n## Nope\n```")).toEqual({
		title: "Title",
		headings: ["One"],
	});
});

test("labelFromName drops numeric order prefixes", () => {
	expect(labelFromName("1.getting-started")).toBe("Getting started");
	expect(labelFromName("api_reference.md")).toBe("Api reference");
});
