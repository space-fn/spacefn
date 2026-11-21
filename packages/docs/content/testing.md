# Testing

Tests sit next to the code, as `*.test.ts`, and run with `npm test` (Vitest, through `configs/vitest.config.ts`, which reuses the generated Vite config so `spacefn/assets` works). They run in Node, in memory: no Worker, no Docker, no database server.

`spacefn/testing` has what you need:

| Helper                         | What it gives                                                           |
| ------------------------------ | ----------------------------------------------------------------------- |
| `testHttp(manifest, services)` | Serves pages, routes and middleware in memory; `fetch` it like a server |
| `testDb(MainDb)`               | A fresh in-memory SQLite database with every migration applied          |
| `memoryServices`               | `Kv`, `Blob`, `Queue`, `Bus` and `RateLimiter` in memory                |
| `testEnv(values)`              | Values for `configs/env.ts`                                             |
| `QueueInbox`                   | What was sent to `Queue.memory`, to assert on                           |

## A page or a route

```ts
import { Layer } from "effect";
import { memoryServices, testDb, testEnv, testHttp } from "spacefn/testing";
import { expect, it } from "vitest";

import MainDb from "#space/db/main.ts";

import Env from "../env.ts";
import todos from "./index.ts";

const app = () =>
	testHttp(
		{
			routes: [
				{
					path: "/",
					params: [],
					file: "app/routes/index.ts",
					module: { default: todos },
				},
			],
		},
		Layer.mergeAll(testDb(MainDb), memoryServices, Env.layer.pipe(Layer.provide(testEnv({})))),
	);

it("adds a todo", async () => {
	const page = app();
	const response = await page.fetch("/?__action=add", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: "title=Ship",
	});
	expect(response.status).toBe(303);
	expect(await (await page.fetch("/")).text()).toContain("Ship");
	await page.dispose();
});
```

A route is listed the same way; middleware goes in `middleware: [...]`. Each `testHttp` builds its services once, so a fresh one gives a fresh database.

## Effects directly

For a query or a service, provide the layers to the effect. `it.effect` comes from `@effect/vitest` (add it to your dev dependencies):

```ts
import { it } from "@effect/vitest";

it.effect("lists todos", () =>
	Effect.gen(function* () {
		const db = yield* MainDb;
		yield* db.addTodo({ title: "Ship" });
		expect((yield* db.listTodos()).map((todo) => todo.title)).toEqual(["Ship"]);
	}).pipe(Effect.provide(testDb(MainDb))),
);
```

Time-based code (TTLs, rate-limit windows, cron schedules) follows Effect's `Clock`, so `TestClock.adjust("2 minutes")` moves it.
