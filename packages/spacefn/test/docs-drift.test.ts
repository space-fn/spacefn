import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

import { describe, expect, test } from "vite-plus/test";

describe("docs examples drift", () => {
	const docsRoot = resolve(ROOT, "packages/create-spacefn/template/docs/spacefn");
	const examplesDir = resolve(docsRoot, "examples");

	test("each fenced block appears verbatim in its declared source", () => {
		for (const name of readdirSync(examplesDir)) {
			if (!name.endsWith(".md")) continue;
			const md = readFileSync(join(examplesDir, name), "utf8");
			const examples = md.matchAll(/<!-- source: (.+?) -->([\s\S]*?)(?=<!-- source: |$)/g);
			for (const example of examples) {
				const src = readFileSync(resolve(ROOT, example[1]!), "utf8");
				const block = example[2]?.match(/```ts\n([\s\S]*?)```/);
				const code = block?.[1]?.trim();
				if (!code || code.split("\n").length < 3) continue;
				expect(src).toContain(code);
			}
		}
	});

	test("all local Markdown links resolve", () => {
		const files: string[] = [];
		const walk = (dir: string) => {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const path = join(dir, entry.name);
				if (entry.isDirectory()) walk(path);
				else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
			}
		};
		walk(docsRoot);

		for (const file of files) {
			const markdown = readFileSync(file, "utf8");
			for (const [, href] of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
				const target = href?.split(/[?#]/, 1)[0]?.trim();
				if (!target || /^(?:[a-z]+:|\/\/|#)/i.test(target)) continue;
				const path = resolve(dirname(file), decodeURIComponent(target));
				const resolves = existsSync(path)
					? !statSync(path).isDirectory() ||
						existsSync(join(path, "index.md")) ||
						existsSync(join(path, "README.md"))
					: false;
				expect(resolves, `${file} links to missing ${href}`).toBe(true);
			}
		}
	});
});
