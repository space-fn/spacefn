import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { space, spaceSync } from "../src/vite";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "space-vite-"));
	await mkdir(join(root, "app", "routes"), { recursive: true });
	await writeFile(join(root, "app", "routes", "hello.ts"), "");
});

afterEach(() => rm(root, { recursive: true, force: true }));

test("generates .space on config", async () => {
	const plugin = spaceSync();
	const config = plugin.config as (c: object, env: object) => Promise<void>;
	await config({ root }, { command: "serve", mode: "development" });
	expect(await readFile(join(root, ".space", "routes.ts"), "utf8")).toContain('"/hello"');
});

test("leaves production-only routes out of dev and keeps them in build", async () => {
	await writeFile(join(root, "app", "routes", "metrics.prod.ts"), "");
	const config = spaceSync().config as (c: object, env: object) => Promise<void>;

	await config({ root }, { command: "serve", mode: "development" });
	expect(await readFile(join(root, ".space", "routes.ts"), "utf8")).not.toContain("/metrics");

	await config({ root }, { command: "build", mode: "production" });
	expect(await readFile(join(root, ".space", "routes.ts"), "utf8")).toContain("/metrics");
});

test("bundles the sync plugin with the cloudflare plugin", () => {
	const plugins = space().flat() as { name: string }[];
	expect(plugins[0]?.name).toBe("space");
	expect(plugins.length).toBeGreaterThan(1);
});
