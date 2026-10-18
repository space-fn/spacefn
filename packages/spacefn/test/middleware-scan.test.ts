import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { scanMiddleware } from "../src/middleware/scan";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "space-mw-"));
});

afterEach(() => rm(dir, { recursive: true, force: true }));

test("returns nothing when the folder is missing", async () => {
  expect(await scanMiddleware(join(dir, "nope"))).toEqual([]);
});

test("orders by numeric prefix and ignores helpers and non-code files", async () => {
  await mkdir(dir, { recursive: true });
  for (const file of ["10-late.ts", "02-log.ts", "01-auth.ts", "_helper.ts", "notes.md"]) {
    await writeFile(join(dir, file), "");
  }
  expect(await scanMiddleware(dir)).toEqual(["01-auth.ts", "02-log.ts", "10-late.ts"]);
});
