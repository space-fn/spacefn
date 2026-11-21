// spacefn's own docs: every link between pages goes to a file and a heading that exist.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { contentDir } from "../src/index.ts";
import { renderMarkdown } from "../src/markdown.ts";

const pages = (readdirSync(contentDir, { recursive: true }) as string[])
	.filter((file) => file.endsWith(".md"))
	.sort();

/** Links in the page's prose, not in its code blocks or inline code. */
const linksOf = (source: string) =>
	[
		...source
			.replace(/^(```|~~~)[\s\S]*?^\1/gm, "")
			.replace(/`[^`\n]*`/g, "")
			.matchAll(/\]\(([^)\s]+\.md)(#[^)\s]*)?\)/g),
	].map((match) => ({ file: match[1]!, anchor: match[2]?.slice(1) }));

const ids = async (file: string) =>
	new Set(
		[...(await renderMarkdown(readFileSync(file, "utf8"))).html.matchAll(/ id="([^"]+)"/g)].map(
			(match) => match[1]!,
		),
	);

describe("spacefn's docs", () => {
	it.each(pages)("%s links to pages and headings that exist", async (page) => {
		const from = join(contentDir, page);
		for (const link of linksOf(readFileSync(from, "utf8"))) {
			if (/^[a-z]+:/.test(link.file)) continue;
			const target = resolve(dirname(from), link.file);
			const where = `${page} → ${relative(contentDir, target)}`;
			expect(existsSync(target), where).toBe(true);
			if (link.anchor)
				expect((await ids(target)).has(link.anchor), `${where}#${link.anchor}`).toBe(true);
		}
	});
});
