import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vite-plus/test";

const RUNTIME_FILES = [
	"src/http.ts",
	"src/ws.ts",
	"src/handler.ts",
	"src/runtime.ts",
	"src/pages.ts",
	"src/auth.ts",
];

describe("bundle guard", () => {
	test("runtime modules do not import build-time modules", () => {
		for (const f of RUNTIME_FILES) {
			const src = readFileSync(resolve(process.cwd(), "packages/spacefn", f), "utf8");
			expect(src).not.toMatch(/from "\.\/(sync|vite|cli)"/);
			expect(src).not.toMatch(/from "node:fs/);
		}
	});
});
