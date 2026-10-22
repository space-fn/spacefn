import { expect, test } from "vite-plus/test";

import { fallbackRender, renderMarkdown } from "../src/docs/markdown";

test("fallback render handles headings and code fences", async () => {
	const md = "# Title\n\n```ts\nconst x = 1;\n```\n\npara";
	const html = fallbackRender(md);
	expect(html).toContain("<h1>Title</h1>");
	expect(html).toContain("<pre><code>const x = 1;</code></pre>");
	expect(html).toContain("<p>para</p>");
});

test("fallback strips trailing hashes from headings", async () => {
	const html = fallbackRender("## Title ##");
	expect(html).toContain("<h2>Title</h2>");
});

test("renderMarkdown returns fallback when marked missing", async () => {
	const html = await renderMarkdown("# Hi");
	expect(html).toContain("<h1>Hi</h1>");
});

test("renderMarkdown code block preserves content", async () => {
	const html = await renderMarkdown("```\nconst a = 1;\n```");
	expect(html).toContain("const a");
});
