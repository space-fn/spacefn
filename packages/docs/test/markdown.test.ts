import { describe, expect, test } from "vitest";

import { frontmatter, parseInfo, renderMarkdown, textOf } from "../src/markdown.ts";

const strip = (html: string) => html.replace(/<span[^>]*>|<\/span>/g, "");

describe("renderMarkdown", () => {
	test("takes the title from the first # heading and lists ## and ### for the page outline", async () => {
		const page = await renderMarkdown("# Hello *world*\n\n## Setup\n\n### Install\n\n## Setup\n");
		expect(page.title).toBe("Hello world");
		expect(page.toc).toEqual([
			{ depth: 2, text: "Setup", id: "setup" },
			{ depth: 3, text: "Install", id: "install" },
			{ depth: 2, text: "Setup", id: "setup-1" },
		]);
		expect(page.html).toContain('<h2 id="setup-1">');
	});

	test("keeps raw HTML, with Markdown inside after a blank line", async () => {
		const page = await renderMarkdown('<div class="steps">\n\n**bold**\n\n</div>\n');
		expect(page.html).toContain('<div class="steps">');
		expect(page.html).toContain("<strong>bold</strong>");
	});

	test("highlights code with its title and marked lines", async () => {
		const page = await renderMarkdown(
			"```ts [app/routes/a.ts] {2}\nconst a = 1;\nconst b = 2;\nconst c = 3; // [!code ++]\n```\n",
		);
		expect(page.html).toContain('data-title="app/routes/a.ts"');
		expect(page.html).toContain('<span class="code-title">app/routes/a.ts</span>');
		expect(page.html).toMatch(/class="line highlighted"/);
		expect(page.html).toMatch(/class="line diff add"/);
		expect(strip(page.html)).not.toContain("[!code");
	});

	test("shows code in a language Shiki doesn't know as plain lines", async () => {
		const page = await renderMarkdown("```nope\n<b>x</b>\n```\n");
		expect(page.html).toContain('data-lang="nope"');
		expect(strip(page.html)).toContain("<code>&#x3C;b>x&#x3C;/b></code>");
	});

	test("turns <code-group> into tabs named by each block's title", async () => {
		const page = await renderMarkdown(
			"<code-group>\n\n```sh [npm]\nnpm i\n```\n\n```sh [pnpm]\npnpm i\n```\n\n</code-group>\n",
		);
		expect(page.html).toContain('<div class="code-group"><div class="code-tabs" role="tablist">');
		expect(page.html).toContain('aria-selected="true" data-label="npm"');
		expect(page.html).toContain('aria-selected="false" data-label="pnpm"');
		expect(page.html).toMatch(/role="tabpanel" hidden data-lang="sh" data-title="pnpm"/);
		expect(page.html).not.toContain("code-group>");
	});

	test("turns GitHub alerts into callouts, named or not", async () => {
		const page = await renderMarkdown(
			"> [!TIP] Run it in CI\n> Body.\n\n> [!WARNING]\n>\n> Careful.\n",
		);
		expect(page.html).toContain(
			'<blockquote class="callout callout-tip"><p class="callout-title">Run it in CI</p><p>Body.</p>',
		);
		expect(page.html).toContain('<p class="callout-title">Warning</p>');
		expect(page.html).toContain("<p>Careful.</p>");
		expect(page.html).not.toContain("<p></p>");
	});

	test("leaves a mermaid block for the browser to draw", async () => {
		const page = await renderMarkdown("```mermaid\ngraph TD; A-->B\n```\n");
		expect(page.mermaid).toBe(true);
		expect(page.html).toContain('<pre class="mermaid">graph TD; A--&gt;B</pre>');
		expect((await renderMarkdown("text")).mermaid).toBe(false);
	});

	test("splits the page's text by heading for search", async () => {
		const page = await renderMarkdown(
			"# T\n\nIntro.\n\n## One\n\nFirst `code`.\n\n## Two\n\nSecond.\n",
		);
		expect(page.sections).toEqual([
			{ id: null, heading: null, text: "T Intro." },
			{ id: "one", heading: "One", text: "First code." },
			{ id: "two", heading: "Two", text: "Second." },
		]);
	});

	test("reads frontmatter and leaves it out of the page", async () => {
		const page = await renderMarkdown("---\ntitle: Set\norder: 2\n---\n# Heading\n");
		expect(page.title).toBe("Set");
		expect(page.frontmatter).toEqual({ title: "Set", order: "2" });
		expect(page.html).not.toContain("order");
	});
});

test("parseInfo splits a fence's language, title and the rest", () => {
	expect(parseInfo("TS [a b.ts] {1,3}")).toEqual({ lang: "ts", title: "a b.ts", meta: "{1,3}" });
	expect(parseInfo("")).toEqual({ lang: "", title: null, meta: "" });
});

test("frontmatter only reads a block at the very top", () => {
	expect(frontmatter("# A\n---\nx: 1\n---\n").data).toEqual({});
	expect(frontmatter('---\ntitle: "Quoted"\n---\nBody').data).toEqual({ title: "Quoted" });
});

test("textOf joins inline tags and decodes entities", () => {
	expect(textOf("<p>a <code>b</code><span>c</span> &amp; &#x41;</p><p>d</p>")).toBe("a bc & A d");
});
