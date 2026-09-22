import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { resolveGlobs, runGenerator, runAll } from "../src/generator.js";
import type { Generator, ResolvedOptions } from "../src/types.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "space-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

// --- resolveGlobs -------------------------------------------------------------

describe("resolveGlobs", () => {
	it("resolves file patterns", async () => {
		await mkdir(join(tempDir, "pages"), { recursive: true });
		await writeFile(join(tempDir, "pages/index.ts"), "export default {}");
		await writeFile(join(tempDir, "pages/about.ts"), "export default {}");
		await writeFile(join(tempDir, "pages/other.txt"), "skip");

		const files = await resolveGlobs(tempDir, "pages/**/*.ts");
		expect(files).toHaveLength(2);
		expect(files.every((f) => f.endsWith(".ts"))).toBe(true);
	});

	it("resolves multiple patterns", async () => {
		await mkdir(join(tempDir, "pages"), { recursive: true });
		await mkdir(join(tempDir, "routes"), { recursive: true });
		await writeFile(join(tempDir, "pages/index.ts"), "");
		await writeFile(join(tempDir, "routes/api.ts"), "");

		const files = await resolveGlobs(tempDir, ["pages/**/*.ts", "routes/**/*.ts"]);
		expect(files).toHaveLength(2);
	});

	it("excludes node_modules", async () => {
		await mkdir(join(tempDir, "node_modules"), { recursive: true });
		await writeFile(join(tempDir, "node_modules/foo.ts"), "");
		await writeFile(join(tempDir, "index.ts"), "");

		const files = await resolveGlobs(tempDir, "**/*.ts");
		expect(files).toHaveLength(1);
		expect(files[0]).toContain("index.ts");
	});
});

// --- runGenerator -------------------------------------------------------------

describe("runGenerator", () => {
	it("generates file from matched sources", async () => {
		await mkdir(join(tempDir, "pages"), { recursive: true });
		await writeFile(join(tempDir, "pages/a.ts"), "");
		await writeFile(join(tempDir, "pages/b.ts"), "");

		const gen: Generator = {
			watch: "pages/**/*.ts",
			output: ".space/routes.ts",
			generate(files) {
				return `export const routes = ${JSON.stringify(files.length)}`;
			},
		};

		const result = await runGenerator(tempDir, gen);
		expect(result.changed).toBe(true);
		expect(result.output).toBe(".space/routes.ts");

		const content = await readFile(join(tempDir, ".space/routes.ts"), "utf-8");
		expect(content).toBe("export const routes = 2");
	});

	it("skips write if content unchanged", async () => {
		await mkdir(join(tempDir, "pages"), { recursive: true });
		await writeFile(join(tempDir, "pages/a.ts"), "");
		await mkdir(join(tempDir, ".space"), { recursive: true });
		await writeFile(join(tempDir, ".space/routes.ts"), "unchanged");

		const gen: Generator = {
			watch: "pages/**/*.ts",
			output: ".space/routes.ts",
			generate() {
				return "unchanged";
			},
		};

		const result = await runGenerator(tempDir, gen);
		expect(result.changed).toBe(false);
	});

	it("creates output directory if needed", async () => {
		await mkdir(join(tempDir, "pages"), { recursive: true });
		await writeFile(join(tempDir, "pages/a.ts"), "");

		const gen: Generator = {
			watch: "pages/**/*.ts",
			output: "deep/nested/path/out.ts",
			generate() {
				return "content";
			},
		};

		await runGenerator(tempDir, gen);
		const content = await readFile(join(tempDir, "deep/nested/path/out.ts"), "utf-8");
		expect(content).toBe("content");
	});
});

// --- runAll -------------------------------------------------------------------

describe("runAll", () => {
	it("runs multiple generators", async () => {
		await mkdir(join(tempDir, "pages"), { recursive: true });
		await mkdir(join(tempDir, "routes"), { recursive: true });
		await writeFile(join(tempDir, "pages/index.ts"), "");
		await writeFile(join(tempDir, "routes/api.ts"), "");

		const options: ResolvedOptions = {
			root: tempDir,
			generators: [
				{
					watch: "pages/**/*.ts",
					output: ".space/pages.ts",
					generate: (files) => `pages: ${files.length}`,
				},
				{
					watch: "routes/**/*.ts",
					output: ".space/routes.ts",
					generate: (files) => `routes: ${files.length}`,
				},
			],
		};

		const results = await runAll(options);
		expect(results).toHaveLength(2);
		expect(results[0].output).toBe(".space/pages.ts");
		expect(results[1].output).toBe(".space/routes.ts");

		const pages = await readFile(join(tempDir, ".space/pages.ts"), "utf-8");
		const routes = await readFile(join(tempDir, ".space/routes.ts"), "utf-8");
		expect(pages).toBe("pages: 1");
		expect(routes).toBe("routes: 1");
	});

	it("handles async generate functions", async () => {
		await mkdir(join(tempDir, "src"), { recursive: true });
		await writeFile(join(tempDir, "src/a.ts"), "");

		const options: ResolvedOptions = {
			root: tempDir,
			generators: [
				{
					watch: "src/**/*.ts",
					output: ".space/out.ts",
					generate: async (files) => {
						return `async: ${files.length}`;
					},
				},
			],
		};

		const results = await runAll(options);
		expect(results[0].changed).toBe(true);

		const content = await readFile(join(tempDir, ".space/out.ts"), "utf-8");
		expect(content).toBe("async: 1");
	});
});
