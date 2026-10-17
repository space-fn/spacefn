import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vitest";

import { space } from "../src/vite";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "space-vite-"));
	await mkdir(join(root, "routes"));
	await writeFile(join(root, "routes", "hello.ts"), "");
});

afterEach(() => rm(root, { recursive: true, force: true }));

test("generates .space on config", async () => {
	const plugin = space();
	const config = plugin.config as (c: object, env: object) => Promise<void>;
	await config({ root }, { command: "serve", mode: "development" });
	expect(await readFile(join(root, ".space", "routes.ts"), "utf8")).toContain('"/hello"');
});

test("leaves production-only routes out of dev and keeps them in build", async () => {
	await writeFile(join(root, "routes", "metrics.prod.ts"), "");
	const config = space().config as (c: object, env: object) => Promise<void>;

	await config({ root }, { command: "serve", mode: "development" });
	expect(await readFile(join(root, ".space", "routes.ts"), "utf8")).not.toContain("/metrics");

	await config({ root }, { command: "build", mode: "production" });
	expect(await readFile(join(root, ".space", "routes.ts"), "utf8")).toContain("/metrics");
});
