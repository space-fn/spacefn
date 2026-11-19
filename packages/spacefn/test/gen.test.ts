import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { gen } from "../src/codegen/gen.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "spacefn-gen-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

const write = (files: Record<string, string>) =>
	Effect.promise(async () => {
		for (const [file, body] of Object.entries(files)) {
			await mkdir(dirname(join(root, file)), { recursive: true });
			await writeFile(join(root, file), body);
		}
	});

const app = {
	"package.json": JSON.stringify({ name: "todo" }),
	".gitignore": "node_modules\n.space/\n",
	"configs/space.ts": `export default { target: "cloudflare" as const };`,
	"app/routes/index.ts": "",
	"app/durable-objects/room.ts": "",
	"app/db/main/migrations/0001_todos.sql": "-- up\nCREATE TABLE todos (id INTEGER PRIMARY KEY);",
};

describe("gen", () => {
	it.effect("writes .space for the app, then nothing when nothing changed", () =>
		Effect.gen(function* () {
			yield* write(app);
			expect((yield* gen(root, "dev")).written).toEqual([
				"db/main.ts",
				"entry.ts",
				"manifest.ts",
				"tsconfig.json",
				"vite.config.ts",
			]);
			expect(yield* gen(root, "dev")).toEqual({ written: [], removed: [] });
		}),
	);

	it.effect("removes what a deleted convention file generated", () =>
		Effect.gen(function* () {
			yield* write(app);
			yield* gen(root, "dev");
			yield* Effect.promise(() => rm(join(root, "app/db"), { recursive: true }));
			const result = yield* gen(root, "dev");
			expect(result.removed).toEqual(["db/main.ts"]);
			expect(result.written).toEqual(["manifest.ts"]);
			expect(yield* Effect.promise(() => readdir(join(root, ".space/db")))).toEqual([]);
		}),
	);

	it.effect("writes nothing when a check fails", () =>
		Effect.gen(function* () {
			yield* write({ ...app, "configs/space.ts": `export default { target: "bun" as const };` });
			expect((yield* Effect.flip(gen(root, "dev"))).code).toBe("TARGET_UNSUPPORTED");
			const entries = yield* Effect.promise(() => readdir(root));
			expect(entries).not.toContain(".space");
		}),
	);
});
