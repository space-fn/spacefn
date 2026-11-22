import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { loadTarget } from "../../src/infra/vite-config.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "spacefn-vite-config-"));
	await mkdir(join(root, "configs"));
	await writeFile(join(root, "package.json"), '{ "name": "app", "type": "module" }');
});
afterEach(() => rm(root, { recursive: true, force: true }));

// A stand-in for space(): a plugin with the api the real one has, so the config needs no imports.
const plugin = (target: string) =>
	`{ name: "spacefn", api: { spacefn: { target: ${JSON.stringify(target)} } } }`;
const writeConfig = (body: string) =>
	Effect.promise(() => writeFile(join(root, "configs", "vite.ts"), body));

describe("loadTarget", () => {
	it.effect("reads the target of the spacefn plugin, nested or in a function config", () =>
		Effect.gen(function* () {
			yield* writeConfig(`export default { plugins: [[{ name: "other" }, ${plugin("bun")}]] };`);
			expect(yield* loadTarget(root)).toBe("bun");
			yield* writeConfig(`export default () => ({ plugins: [${plugin("cloudflare")}] });`);
			expect(yield* loadTarget(root)).toBe("cloudflare");
		}),
	);

	it.effect("explains a missing config, a missing plugin and a wrong target", () =>
		Effect.gen(function* () {
			expect(yield* Effect.flip(loadTarget(join(root, "nope")))).toMatchObject({
				code: "CONFIG_MISSING",
				file: "configs/vite.ts",
			});
			yield* writeConfig("export default { plugins: [] };");
			expect(yield* Effect.flip(loadTarget(root))).toMatchObject({ code: "CONFIG_PLUGIN" });
			yield* writeConfig(`export default { plugins: [${plugin("lambda")}] };`);
			expect(yield* Effect.flip(loadTarget(root))).toMatchObject({ code: "CONFIG_TARGET" });
			yield* writeConfig("export default {");
			expect(yield* Effect.flip(loadTarget(root))).toMatchObject({ code: "CONFIG_LOAD" });
		}),
	);
});
