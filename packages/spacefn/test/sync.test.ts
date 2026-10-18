import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { sync } from "../src/sync";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "space-all-"));
  await mkdir(join(root, "app", "routes"), { recursive: true });
  await writeFile(join(root, "app", "routes", "index.ts"), "");
});

afterEach(() => rm(root, { recursive: true, force: true }));

test("writes the routes module and the worker entry", async () => {
  expect(await sync(root, "dev")).toBe(true);
  expect(await readFile(join(root, ".space", "routes.ts"), "utf8")).toContain("registerRoutes");
  const worker = await readFile(join(root, ".space", "worker.ts"), "utf8");
  expect(worker).toContain('import { registerRoutes as _registerRoutes } from "./routes";');
  expect(worker).toContain("app.use(traceConfig());");
  expect(worker).toContain("app.use(traceRequest());");
  expect(worker).toContain("runWithBindings(bindings, () => app.fetch(request, bindings, ctx))");
  expect(worker).toContain("export function createApp");
});

test("reports no change on a second run", async () => {
  await sync(root, "dev");
  expect(await sync(root, "dev")).toBe(false);
});

test("wires env.ts into the worker entry when it exists", async () => {
  await sync(root, "dev");
  const without = await readFile(join(root, ".space", "worker.ts"), "utf8");
  // envMiddleware is available; env schema is no longer auto-imported/wired
  expect(without).not.toContain('import schema from "../app/env";');

  await writeFile(join(root, "app", "env.ts"), "");
  expect(await sync(root, "dev")).toBe(true);
  const withEnv = await readFile(join(root, ".space", "worker.ts"), "utf8");
  expect(withEnv).toContain("envMiddleware");
  expect(withEnv).not.toContain('import schema from "../app/env";');
});

test("writes env types only when env.ts exists", async () => {
  await sync(root, "dev");
  expect(await readFile(join(root, ".space", "env.d.ts"), "utf8")).not.toContain("Register");

  await writeFile(join(root, "app", "env.ts"), "");
  await sync(root, "dev");
  const types = await readFile(join(root, ".space", "env.d.ts"), "utf8");
  expect(types).toContain('declare module "spacefn/env"');
  expect(types).toContain("env: InferEnv<typeof schema>;");

  await rm(join(root, "app", "env.ts"));
  await sync(root, "dev");
  expect(await readFile(join(root, ".space", "env.d.ts"), "utf8")).not.toContain("Register");
});

test("registers middleware files in order, after the built-ins", async () => {
  await mkdir(join(root, "app", "middleware"), { recursive: true });
  await writeFile(join(root, "app", "middleware", "02-log.ts"), "");
  await writeFile(join(root, "app", "middleware", "01-auth.ts"), "");
  await sync(root, "dev");
  const worker = await readFile(join(root, ".space", "worker.ts"), "utf8");
  expect(worker).toContain('import middleware0 from "../app/middleware/01-auth";');
  expect(worker).toContain('import middleware1 from "../app/middleware/02-log";');
  const order = ["app.use(traceRequest());", "app.use(middleware0);", "app.use(middleware1);"];
  const positions = order.map((line) => worker.indexOf(line));
  expect(positions.every((p) => p >= 0)).toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
});
