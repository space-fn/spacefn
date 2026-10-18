import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { syncRoutes } from "../src/routes/sync";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "space-sync-"));
  await mkdir(join(root, "app", "routes"), { recursive: true });
  await writeFile(join(root, "app", "routes", "hello.ts"), "");
});

afterEach(() => rm(root, { recursive: true, force: true }));

test("writes .space/routes.ts", async () => {
  expect(await syncRoutes(root, "dev")).toBe(true);
  const source = await readFile(join(root, ".space", "routes.ts"), "utf8");
  expect(source).toContain('mountRoute(app, "/hello", route0);');
});

test("does not rewrite unchanged output", async () => {
  await syncRoutes(root, "dev");
  expect(await syncRoutes(root, "dev")).toBe(false);
});

test("rewrites when routes change", async () => {
  await syncRoutes(root, "dev");
  await writeFile(join(root, "app", "routes", "bye.ts"), "");
  expect(await syncRoutes(root, "dev")).toBe(true);
});
