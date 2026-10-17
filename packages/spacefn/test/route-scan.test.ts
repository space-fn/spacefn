import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vitest";

import { scanRoutes } from "../src/routes/scan";

let dir: string;

async function touch(...files: string[]) {
	for (const file of files) {
		await mkdir(dirname(join(dir, file)), { recursive: true });
		await writeFile(join(dir, file), "");
	}
}

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "space-routes-"));
});

afterEach(() => rm(dir, { recursive: true, force: true }));

test("returns nothing when the directory is missing", async () => {
	expect(await scanRoutes(join(dir, "nope"), "dev")).toEqual([]);
});

test("orders static before dynamic before catch-all", async () => {
	await touch("[...rest].ts", "users/[id].ts", "users/me.ts", "index.ts");
	const paths = (await scanRoutes(dir, "dev")).map((route) => route.path);
	expect(paths).toEqual(["/", "/users/me", "/users/:id", "/:rest{.+}"]);
});

test("skips ignored files and other environments", async () => {
	await touch("a.ts", "_skip.ts", "dev-only.dev.ts", "prod-only.prod.ts", "notes.md");
	expect((await scanRoutes(dir, "dev")).map((route) => route.file)).toEqual([
		"a.ts",
		"dev-only.dev.ts",
	]);
	expect((await scanRoutes(dir, "prod")).map((route) => route.file)).toEqual([
		"a.ts",
		"prod-only.prod.ts",
	]);
});

test("rejects two files with the same path", async () => {
	await touch("users.ts", "users/index.ts");
	await expect(scanRoutes(dir, "dev")).rejects.toThrow("both map to /users");
});
