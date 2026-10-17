import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vitest";

import { loadEnvSchema } from "../src/env/load";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "space-envload-"));
});

afterEach(() => rm(root, { recursive: true, force: true }));

test("returns undefined without env.ts", async () => {
	expect(await loadEnvSchema(root)).toBeUndefined();
});

test("loads the default export", async () => {
	await writeFile(join(root, "env.ts"), "export default { A: { kind: 'string' } };\n");
	expect(await loadEnvSchema(root)).toEqual({ A: { kind: "string" } });
});

test("picks up edits", async () => {
	await writeFile(join(root, "env.ts"), "export default { A: 1 };\n");
	await loadEnvSchema(root);
	await writeFile(join(root, "env.ts"), "export default { B: 2 };\n");
	expect(await loadEnvSchema(root)).toEqual({ B: 2 });
});

test("requires a default export", async () => {
	await writeFile(join(root, "env.ts"), "export const nope = 1;\n");
	await expect(loadEnvSchema(root)).rejects.toThrow("must export the result of defineEnv()");
});
