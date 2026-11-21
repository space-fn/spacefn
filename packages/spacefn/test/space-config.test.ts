import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { loadSpaceConfig } from "../src/codegen/load-space-config.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "spacefn-config-"));
	await mkdir(join(root, "configs"));
	await writeFile(join(root, "package.json"), JSON.stringify({ name: "@acme/todo-app" }));
});
afterEach(() => rm(root, { recursive: true, force: true }));

// Plain objects, so the fixture needs no import of spacefn from a temp folder.
const writeConfig = (body: string) => writeFile(join(root, "configs/space.ts"), body);

describe("loadSpaceConfig", () => {
	it.effect(
		"applies defaults: the name from package.json, and no code folders without imports",
		() =>
			Effect.gen(function* () {
				yield* Effect.promise(() =>
					writeConfig(`export default { target: "cloudflare" as const };`),
				);
				expect(yield* loadSpaceConfig(root)).toEqual({
					target: "cloudflare",
					name: "todo-app",
					folders: [],
					db: {},
				});
			}),
	);

	it.effect("takes the name from the config, and code folders from package.json imports", () =>
		Effect.gen(function* () {
			yield* Effect.promise(async () => {
				await writeFile(
					join(root, "package.json"),
					JSON.stringify({
						name: "todo-app",
						imports: {
							"#lib/*": "./lib/*",
							"#ui/*": "./src/ui/*",
							"#space/*": "./.space/*",
							"#env": "./configs/env.ts",
							"#dup/*": "./lib/*",
						},
					}),
				);
				await writeConfig(`export default { target: "bun", name: "todos" };`);
			});
			const config = yield* loadSpaceConfig(root);
			expect(config).toMatchObject({ target: "bun", name: "todos", folders: ["lib", "src/ui"] });
		}),
	);

	it.effect("rejects an unknown target", () =>
		Effect.gen(function* () {
			yield* Effect.promise(() => writeConfig(`export default { target: "lambda" };`));
			const error = yield* Effect.flip(loadSpaceConfig(root));
			expect(error).toMatchObject({ code: "CONFIG_INVALID", file: "configs/space.ts" });
			expect(error.message).toContain("target");
		}),
	);

	it.effect("reads database drivers and rejects unknown ones", () =>
		Effect.gen(function* () {
			yield* Effect.promise(() =>
				writeConfig(
					`export default { target: "cloudflare", db: { main: "d1", rooms: "durable-object" } };`,
				),
			);
			expect((yield* loadSpaceConfig(root)).db).toEqual({ main: "d1", rooms: "durable-object" });

			yield* Effect.promise(() =>
				writeConfig(`export default { target: "bun", db: { main: "postgres" } };`),
			);
			expect((yield* Effect.flip(loadSpaceConfig(root))).code).toBe("CONFIG_INVALID");
		}),
	);

	it.effect("explains a missing file", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(loadSpaceConfig(root));
			expect(error.code).toBe("CONFIG_MISSING");
			expect(error.hint).toContain("defineSpace");
		}),
	);

	it.effect("explains a missing default export", () =>
		Effect.gen(function* () {
			yield* Effect.promise(() => writeConfig(`export const config = { target: "bun" };`));
			expect((yield* Effect.flip(loadSpaceConfig(root))).code).toBe("CONFIG_EXPORT");
		}),
	);
});
