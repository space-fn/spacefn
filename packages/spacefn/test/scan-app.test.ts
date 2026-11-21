import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { scanApp } from "../src/codegen/scan-app.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "spacefn-scan-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

const write = (files: Record<string, string>) =>
	Effect.promise(async () => {
		for (const [file, body] of Object.entries(files)) {
			await mkdir(dirname(join(root, file)), { recursive: true });
			await writeFile(join(root, file), body);
		}
	});

describe("scanApp", () => {
	it.effect("gives empty listings for an empty app", () =>
		Effect.gen(function* () {
			expect(yield* scanApp(root)).toEqual({
				env: false,
				entry: false,
				routes: [],
				queues: [],
				crons: [],
				cronSources: {},
				durableObjects: [],
				workflows: [],
				client: [],
				db: [],
				gitignore: undefined,
			});
		}),
	);

	it.effect("lists routes recursively and flat folders one level deep, sorted", () =>
		Effect.gen(function* () {
			yield* write({
				"configs/env.ts": "",
				"app/routes/index.ts": "",
				"app/routes/users/[id].ts": "",
				"app/routes/users/_shared/x.ts": "",
				"app/routes/_middleware.ts": "",
				"app/durable-objects/chat-room.ts": "",
				"app/client/main.ts": "",
				"app/client/style.css": "",
				".gitignore": ".space\n",
			});
			const tree = yield* scanApp(root);
			expect(tree.env).toBe(true);
			expect(tree.entry).toBe(false);
			expect(tree.routes).toEqual([
				"_middleware.ts",
				"index.ts",
				"users/_shared/x.ts",
				"users/[id].ts",
			]);
			expect(tree.durableObjects).toEqual(["chat-room.ts"]);
			expect(tree.client).toEqual(["main.ts", "style.css"]);
			expect(tree.gitignore).toBe(".space\n");
		}),
	);

	it.effect("reads each database's migrations and checked queries", () =>
		Effect.gen(function* () {
			yield* write({
				"app/db/main/migrations/0001_todos.sql":
					"-- up\nCREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT NOT NULL);",
				"app/db/main/queries/list-todos.sql": "SELECT id, title FROM todos;",
				"app/db/_draft/migrations/0001_x.sql": "-- up\nCREATE TABLE x (a);",
			});
			const [main, ...rest] = (yield* scanApp(root)).db;
			expect(rest).toEqual([]);
			expect(main?.name).toBe("main");
			expect(main?.migrations.map((m) => m.id)).toEqual(["0001_todos"]);
			expect(main?.queries.map((q) => [q.name, q.columns.map((c) => c.type)])).toEqual([
				["listTodos", ["number", "string"]],
			]);
		}),
	);

	it.effect("reports a bad query with its code and path under app/db", () =>
		Effect.gen(function* () {
			yield* write({
				"app/db/main/migrations/0001_todos.sql": "-- up\nCREATE TABLE todos (id INTEGER);",
				"app/db/main/queries/bad.sql": "-- :one\nSELECT nope FROM todos;",
			});
			const error = yield* Effect.flip(scanApp(root));
			expect(error.file).toBe("app/db/main/queries/bad.sql");
			expect(error.code).toMatch(/^QUERY_/);
		}),
	);

	it.effect("reads cron sources", () =>
		Effect.gen(function* () {
			yield* write({ "app/crons/nightly.ts": 'export default cron("0 3 * * *", job);' });
			expect((yield* scanApp(root)).cronSources).toEqual({
				"nightly.ts": 'export default cron("0 3 * * *", job);',
			});
		}),
	);
});
