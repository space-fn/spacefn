import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, test } from "vite-plus/test";

describe("docs examples drift", () => {
	const examplesDir = resolve(
		process.cwd(),
		"packages/create-spacefn/template/docs/spacefn/examples",
	);
	const root = resolve(process.cwd());

	test("each fenced block appears verbatim in its declared source", () => {
		for (const name of readdirSync(examplesDir)) {
			if (!name.endsWith(".md")) continue;
			const md = readFileSync(join(examplesDir, name), "utf8");
			const srcMatch = md.match(/<!-- source: (.+?) -->/);
			if (!srcMatch) continue;
			const src = readFileSync(resolve(root, srcMatch[1]!), "utf8");
			const blocks = md.match(/```ts\n([\s\S]*?)```/g) ?? [];
			for (const b of blocks) {
				const code = b
					.replace(/^```ts\n/, "")
					.replace(/\n```$/, "")
					.trim();
				if (code.split("\n").length < 3) continue;
				expect(src).toContain(code);
			}
		}
	});
});
