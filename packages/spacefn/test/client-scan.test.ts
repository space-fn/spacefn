import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { scanClientFiles } from "../src/client/scan";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "space-scan-"));
	await mkdir(join(root, "app", "client"), { recursive: true });
});

afterEach(() => rm(root, { recursive: true, force: true }));

test("skips _-prefixed, test, spec, d.ts files", async () => {
	const dir = join(root, "app", "client");
	await writeFile(join(dir, "_shared.ts"), "");
	await writeFile(join(dir, "foo.test.ts"), "");
	await writeFile(join(dir, "foo.spec.ts"), "");
	await writeFile(join(dir, "types.d.ts"), "");
	await writeFile(join(dir, "keep.ts"), "");
	const files = await scanClientFiles(dir);
	expect(files).toEqual(["keep.ts"]);
});

test("rejects colliding base names", async () => {
	const dir = join(root, "app", "client");
	await writeFile(join(dir, "counter.ts"), "");
	await writeFile(join(dir, "counter.css"), "");
	await expect(scanClientFiles(dir)).rejects.toThrow(/share the base name/);
});

test("rejects unsafe file names", async () => {
	const dir = join(root, "app", "client");
	await writeFile(join(dir, "bad name.ts"), "");
	const files = await scanClientFiles(dir);
	expect(files).toEqual([]);
});
