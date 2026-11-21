import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { loadAppConfig } from "../src/codegen/load-app-config.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "spacefn-config-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

const writePackage = (pkg: object) =>
	Effect.promise(() => writeFile(join(root, "package.json"), JSON.stringify(pkg)));

describe("loadAppConfig", () => {
	it.effect("names the app after package.json, without its scope", () =>
		Effect.gen(function* () {
			yield* writePackage({ name: "@acme/todo-app" });
			expect(yield* loadAppConfig(root, "cloudflare")).toEqual({
				target: "cloudflare",
				name: "todo-app",
				folders: [],
			});
		}),
	);

	it.effect("reads the app's code folders from package.json imports", () =>
		Effect.gen(function* () {
			yield* writePackage({
				name: "todo-app",
				imports: {
					"#lib/*": "./lib/*",
					"#ui/*": "./src/ui/*",
					"#space/*": "./.space/*",
					"#env": "./configs/env.ts",
					"#dup/*": "./lib/*",
				},
			});
			expect((yield* loadAppConfig(root, "bun")).folders).toEqual(["lib", "src/ui"]);
		}),
	);

	it.effect("refuses a name Workers and containers can't use", () =>
		Effect.gen(function* () {
			for (const pkg of [{}, { name: "Todo App" }, { name: "1todo" }]) {
				yield* writePackage(pkg);
				expect(yield* Effect.flip(loadAppConfig(root, "bun"))).toMatchObject({
					code: "CONFIG_NAME",
					file: "package.json",
				});
			}
		}),
	);
});
