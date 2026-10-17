import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vitest";

import { sync } from "../src/sync";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "space-all-"));
	await mkdir(join(root, "routes"));
	await writeFile(join(root, "routes", "index.ts"), "");
});

afterEach(() => rm(root, { recursive: true, force: true }));

test("writes the routes module and the worker entry", async () => {
	expect(await sync(root, "dev")).toBe(true);
	expect(await readFile(join(root, ".space", "routes.ts"), "utf8")).toContain("registerRoutes");
	const worker = await readFile(join(root, ".space", "worker.ts"), "utf8");
	expect(worker).toContain('import { registerRoutes } from "./routes";');
	expect(worker).toContain("export default app;");
});

test("reports no change on a second run", async () => {
	await sync(root, "dev");
	expect(await sync(root, "dev")).toBe(false);
});
