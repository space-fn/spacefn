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
	expect(worker).toContain("app.use(traceConfig());");
	expect(worker).toContain("app.use(traceRequest());");
	expect(worker).toContain("app.fetch(request, traceBindings(env), ctx)");
	expect(worker).toContain("export default {");
});

test("reports no change on a second run", async () => {
	await sync(root, "dev");
	expect(await sync(root, "dev")).toBe(false);
});

test("wires env.ts into the worker entry when it exists", async () => {
	await sync(root, "dev");
	const without = await readFile(join(root, ".space", "worker.ts"), "utf8");
	expect(without).not.toContain("envMiddleware");

	await writeFile(join(root, "env.ts"), "");
	expect(await sync(root, "dev")).toBe(true);
	const withEnv = await readFile(join(root, ".space", "worker.ts"), "utf8");
	expect(withEnv).toContain(
		'import { Hono, traceBindings, traceConfig, traceRequest, envMiddleware } from "spacefn/runtime";',
	);
	expect(withEnv).toContain('import schema from "../env";');
	expect(withEnv.indexOf("app.use(envMiddleware(schema));")).toBeLessThan(
		withEnv.indexOf("registerRoutes(app);"),
	);
});

test("writes env types only when env.ts exists", async () => {
	await sync(root, "dev");
	expect(await readFile(join(root, ".space", "env.d.ts"), "utf8")).not.toContain("Register");

	await writeFile(join(root, "env.ts"), "");
	await sync(root, "dev");
	const types = await readFile(join(root, ".space", "env.d.ts"), "utf8");
	expect(types).toContain('declare module "spacefn/env"');
	expect(types).toContain("env: InferEnv<typeof schema>;");

	await rm(join(root, "env.ts"));
	await sync(root, "dev");
	expect(await readFile(join(root, ".space", "env.d.ts"), "utf8")).not.toContain("Register");
});
