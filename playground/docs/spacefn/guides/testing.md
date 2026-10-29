# Testing

spacefn apps are tested with [Vitest](https://vitest.dev) through `vite-plus`. The template ships a `test` script (`vp test`) and a Cloudflare Workers test environment.

## Running

```bash
vp test run          # one shot
vp test              # watch mode
vp test run --coverage
```

## Testing a route handler

Use `testFetch` from `spacefn/testing` to call a Hono app or Worker entrypoint
without starting a server:

```ts
import { Hono } from "hono";
import { testFetch } from "spacefn/testing";
import { expect, test } from "vite-plus/test";

const app = new Hono();
app.get("/hello", (c) => c.json({ message: "hello" }));

test("serves a route", async () => {
	const response = await testFetch(app, "/hello");
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ message: "hello" });
});
```

## Testing database code

`d1Executor` accepts any `D1Database`. In tests, use a D1 fake or an in-memory SQLite shim, then call the generated function directly:

```ts
import { findTodo } from "@space/db/main_db";

const rows = await findTodo(executor, { id: 1 });
```

Run `space db doctor` to validate migrations and queries against the schema before tests. This is a static check; it does not connect to a deployed database or apply migrations.

## Cloudflare vitest plugin

For integration tests against real Workers bindings, use `@cloudflare/vitest-pool-workers` with the Cloudflare Vite plugin. Add it to `vite.config.ts` and declare the bindings you need (D1, KV, DO) in the test config.

## Tips

- Co-locate tests as `*.test.ts` next to the file under test; they are ignored by the scanner.
- Pass test bindings as the fourth argument to `testFetch(worker, path, init, env)` when the Worker needs `c.env`.
- Keep tests deterministic: no network, no real clocks.
