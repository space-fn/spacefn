# Testing

Tests sit next to the code, as `*.test.ts`, and run with `npm test` (Vitest, through `configs/vitest.ts`, which merges `configs/vite.ts` so the spacefn plugin runs too). They run in Node, in memory: no Worker, no Docker, no database server.

`spacefn/testing` has what you need:

| Helper                        | What it gives                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `testApp(manifest, services)` | Serves the app's pages, routes and middleware in memory; `fetch` it like a server |
| `form(fields)`                | A form post for `fetch`, as a browser sends one                                   |
| `testDb(MainDb)`              | A fresh in-memory SQLite database with every migration applied                    |
| `memoryServices`              | `Kv`, `Blob`, `Queue`, `Bus` and `RateLimiter` in memory                          |
| `testEnv(values)`             | Values for `configs/env.ts`                                                       |
| `QueueInbox`                  | What was sent to `Queue.memory`, to assert on                                     |

## A page or a route

```ts
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

## Effects directly

For a query or a service, provide the layers to the effect. `it.effect` comes from `@effect/vitest` (add it to your dev dependencies):

```ts
import { it } from "@effect/vitest";

it.effect("lists todos", () =>
	Effect.gen(function* () {
		yield* MainDb.addTodo({ title: "Ship" });
		expect((yield* MainDb.listTodos()).map((todo) => todo.title)).toEqual(["Ship"]);
	}).pipe(Effect.provide(testDb(MainDb))),
);
```

Time-based code (TTLs, rate-limit windows, cron schedules) follows Effect's `Clock`, so `TestClock.adjust("2 minutes")` moves it.
