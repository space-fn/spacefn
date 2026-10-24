import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vite-plus/test";

import { scaffold } from "../src/scaffold";

const created: string[] = [];

afterEach(() => {
	for (const dir of created.splice(0)) {
		if (existsSync(dir)) {
			rmSync(dir, { recursive: true, force: true });
		}
	}
});

function scaffoldProject(name: string): string {
	const parent = mkdtempSync(join(tmpdir(), "create-spacefn-"));
	const target = join(parent, name);
	created.push(parent);
	scaffold(target, name);
	return target;
}

describe("scaffold", () => {
	test("writes .gitignore (npm strips dot-gitignore from the package)", () => {
		const target = scaffoldProject("my-app");
		expect(existsSync(join(target, ".gitignore"))).toBe(true);
		expect(existsSync(join(target, "gitignore"))).toBe(false);
		const gitignore = readFileSync(join(target, ".gitignore"), "utf8");
		expect(gitignore).toContain(".dev.vars");
		expect(gitignore).toContain(".env");
		expect(gitignore).toContain("node_modules");
	});

	test("names the package after the project", () => {
		const target = scaffoldProject("my-app");
		const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as {
			name: string;
			dependencies: Record<string, string>;
			devDependencies: Record<string, string>;
		};
		expect(pkg.name).toBe("my-app");
		expect(pkg.dependencies.hono).toBeDefined();
		expect(pkg.dependencies.cf).toBeDefined();
		expect(pkg.devDependencies["@cloudflare/vite-plugin"]).toBeDefined();
	});

	test("copies the expected template files", () => {
		const target = scaffoldProject("my-app");
		for (const file of [
			"package.json",
			"tsconfig.json",
			"vite.config.ts",
			"AGENTS.md",
			"app/entry.ts",
			"app/env.ts",
			"app/routes/index.ts",
			"cloudflare.config.ts",
			"docs/spacefn/directory-structure/pages.md",
			"docs/spacefn/directory-structure/database.md",
			"docs/spacefn/directory-structure/routes.md",
			"docs/spacefn/directory-structure/middleware.md",
			"docs/spacefn/directory-structure/queues.md",
			"docs/spacefn/directory-structure/crons.md",
			"docs/spacefn/directory-structure/durable-objects.md",
			"docs/spacefn/directory-structure/workflows.md",
			"docs/spacefn/directory-structure/modules.md",
		]) {
			expect(existsSync(join(target, file)), file).toBe(true);
		}
	});

	test("skips local test residue", () => {
		const target = scaffoldProject("my-app");
		for (const dir of [".space", ".cloudflare", "node_modules", "dist"]) {
			expect(existsSync(join(target, dir)), dir).toBe(false);
		}
	});

	test("refuses an existing directory", () => {
		const parent = mkdtempSync(join(tmpdir(), "create-spacefn-"));
		created.push(parent);
		const target = join(parent, "my-app");
		scaffold(target, "my-app");
		expect(() => scaffold(target, "my-app")).toThrow(/already exists/);
	});
});
