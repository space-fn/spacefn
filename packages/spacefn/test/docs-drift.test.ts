import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, test } from "vite-plus/test";

describe("docs examples imports", () => {
	const examplesDir = resolve(
		process.cwd(),
		"packages/create-spacefn/template/docs/spacefn/examples",
	);
	test("every spacefn subpath import is a real export", async () => {
		const pkg = JSON.parse(
			readFileSync(resolve(process.cwd(), "packages/spacefn/package.json"), "utf8"),
		);
		const exports = Object.keys(pkg.exports).map((k) => k.replace("./", ""));
		for (const name of readdirSync(examplesDir)) {
			if (!name.endsWith(".md")) continue;
			const md = readFileSync(join(examplesDir, name), "utf8");
			const matches = md.matchAll(/from "spacefn\/([^"]+)"/g);
			for (const m of matches) {
				expect(exports).toContain(m[1]);
			}
		}
	});
});
