---
icon: test-pipe
---

# Testing

Tests sit next to the code they test, as `*.test.ts`: a feature's in its `modules/<feature>/` folder, shared code's in `lib/`. `npm test` runs every one in `app/`, `modules/` and `lib/` with Vitest, through `configs/vitest.ts`, which merges `configs/vite.ts` so the spacefn plugin runs too. They run in Node, in memory: no Worker, no Docker, no database server.

`spacefn/testing` has what you need:

| Helper                        | What it gives                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `testApp(manifest, services)` | Serves the app's pages, routes and middleware in memory; `fetch` it like a server |
| `form(fields)`                | A form post for `fetch`, as a browser sends one                                   |
| `testDb(MainDb)`              | A fresh in-memory SQLite database with every migration applied                    |
| `memoryServices`              | `Kv`, `Blob`, `Queue`, `Bus` and `RateLimiter` in memory                          |
| `testEnv(values)`             | Values for `configs/env.ts`                                                       |
| `QueueInbox`                  | What was sent to `Queue.memory`, to assert on                                     |

## A feature through its pages

Test a feature as a browser uses it: through the pages and routes that wire it up.

```ts [modules/todos/todos.test.ts]
import { Layer } from "effect";
import { form, memoryServices, testApp, testDb, testEnv } from "spacefn/testing";
import { expect, it } from "vitest";

import Env from "#configs/env.ts";
import MainDb from "#space/db/main.ts";
import { manifest } from "#space/manifest.ts";

it("adds a todo", async () => {
	await using app = testApp(
		manifest,
		Layer.mergeAll(testDb(MainDb), memoryServices, Env.layer.pipe(Layer.provide(testEnv({})))),
	);
	const response = await app.fetch("/?__action=add", form({ title: "Ship" }));
	expect(response.status).toBe(303);
	expect(await (await app.fetch("/")).text()).toContain("Ship");
});
```

`testApp` takes the generated manifest, so every page, route and `_middleware.ts` is served as in the app; pass `{ routes: [...] }` instead to serve only some. The services are what the entry's `services` would give, in memory. Each `testApp` builds them once, so a fresh one gives a fresh database, and `await using` releases them at the end of the test.

## A feature's code directly

The functions in `modules/` are Effects, so a test can run them without HTTP: provide the layers they use. `it.effect` comes from `@effect/vitest` (add it to your dev dependencies):

```ts [modules/todos/todos.test.ts]
import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { memoryServices, testDb } from "spacefn/testing";
import { expect } from "vitest";

import MainDb from "#space/db/main.ts";

import * as Todos from "./todos.ts";

it.effect("adds a todo, and lists it", () =>
	Effect.gen(function* () {
		yield* Todos.add({ title: "Ship" });
		expect((yield* Todos.list).map((todo) => todo.title)).toEqual(["Ship"]);
	}).pipe(Effect.provide(Layer.mergeAll(testDb(MainDb), memoryServices))),
);
```

`memoryServices` is there because `Todos.add` publishes on the `Bus`.

Time-based code (TTLs, rate-limit windows, cron schedules) follows Effect's `Clock`, so `TestClock.adjust("2 minutes")` moves it.
