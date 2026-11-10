# Testing

spacefn apps are tested with [Vitest](https://vitest.dev) through `vite-plus`. The template ships a `test` script (`vp test`) and a Cloudflare Workers test environment.

## Running

```bash
vp test run          # one shot
vp test              # watch mode
vp test run --coverage
```

## Test modules first

Most of a project's code lives in `modules/`, and a module takes its
dependencies as arguments, so most tests call it directly: no Worker, no
request, no bindings. See [modules](../directory-structure/modules.md).

```ts
// modules/todos/todos.test.ts

import { AppError } from "@utils/errors";
import { expect, test } from "vite-plus/test";

import { todoTitle } from "./todos";

test("rejects an empty title", () => {
	expect(() => todoTitle("   ")).toThrow(AppError);
});
```

For a module that queries the database, pass it a real in-memory SQLite
executor with the generated migrations applied. A small helper in `utils/`
builds one:

```ts
// utils/test-db.ts

/// <reference types="node" />

import { DatabaseSync } from "node:sqlite";

import type { DbReader } from "spacefn/db";

/** An in-memory SQLite database with `migrations` applied, for module tests. */
export function memoryDb(migrations: { sql: string }[]): DbReader {
	const db = new DatabaseSync(":memory:");
	for (const migration of migrations) db.exec(migration.sql);
	return {
		async query<T>(sql: string, params: unknown[] = []) {
			const statement = db.prepare(sql);
			if (statement.columns().length === 0) {
				statement.run(...(params as never[]));
				return [] as T[];
			}
			return statement.all(...(params as never[])) as T[];
		},
	};
}
```

```ts
// modules/todos/todos.db.test.ts

import { migrations } from "@space/db/main_db";
import { memoryDb } from "@utils/test-db";
import { expect, test } from "vite-plus/test";

import { allTodos, createTodo } from "./todos";

test("a created todo is listed", async () => {
	const db = memoryDb(migrations);
	await createTodo(db, { title: "Buy milk" });
	expect(await allTodos(db)).toMatchObject([{ title: "Buy milk", done: 0 }]);
});
```

The same module function runs against D1 in production; the test only swaps
the executor. Run `space gen` before the tests so `@space/db/main_db` exists.

## Testing a route handler

A route test covers the setup: parsing, status codes, and error mapping. Use
`testFetch` from `spacefn/testing` to call a Hono app or Worker entrypoint
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

For the full Worker entry, pass its bindings as the fourth argument:

```ts
import { testFetch } from "spacefn/testing";

import worker from "../app/entry";
import { testEnv } from "./fixtures";

// testEnv includes every binding required by app/env.ts and cloudflare.config.ts.
const response = await testFetch(worker, "/hello", { method: "GET" }, testEnv);
```

`testFetch` creates a `Request` and calls `worker.fetch(request, env)`. It does
not start a server or create a Cloudflare execution context. For a route that
uses the database, use the Cloudflare Workers test runtime so `env.DB` is a
real test binding rather than a hand-written partial mock.

## Test middleware behavior

Middleware can be tested on a small Hono app without booting the Worker:

```ts
import { Hono } from "hono";
import { testFetch } from "spacefn/testing";
import { expect, test } from "vite-plus/test";

import poweredBy from "../app/middleware/01-powered-by";

test("adds the powered-by header", async () => {
	const app = new Hono();
	app.use("*", poweredBy);
	app.get("/health", (c) => c.text("ok"));

	const response = await testFetch(app, "/health");
	expect(response.headers.get("x-powered-by")).toBe("spacefn");
});
```

## Assert a Datastar fragment

Test a page action's response as HTML. This verifies the fragment contract
without requiring a browser:

```ts
import { Hono } from "hono";
import { html } from "spacefn/pages";
import { expect, test } from "vite-plus/test";

test("returns a fragment Datastar can morph", async () => {
	const app = new Hono();
	app.post("/counter", (c) => c.html(html`<p id="count">Count: 3</p>`));

	const response = await app.request("/counter", { method: "POST" });
	expect(response.headers.get("content-type")).toContain("text/html");
	expect(await response.text()).toContain('<p id="count">Count: 3</p>');
});
```

For an actual page action, mount the page through the generated Worker and
post to `actions.<name>.path()`. Keep the fragment's ID stable so Datastar can
find the element to morph.

## Test a queue consumer

A consumer is setup, so its test checks the setup: that it builds the client,
hands each message over, and acknowledges or retries. Mock the `lib/` client
so the test never sends a real message:

```ts
// app/queues/emails.test.ts

import { expect, test, vi } from "vite-plus/test";

const send = vi.fn();
vi.mock("@lib/email", () => ({ createEmailClient: () => ({ send }) }));

const { default: emails } = await import("./emails");

function batchOf(body: { to: string; subject: string; body: string }) {
	const message = { id: "message-1", body, attempts: 1, ack: vi.fn(), retry: vi.fn() };
	const batch = { queue: "emails", messages: [message], ackAll: vi.fn(), retryAll: vi.fn() };
	return { batch, message };
}

test("acknowledges a delivered email", async () => {
	const { batch, message } = batchOf({ to: "a@example.test", subject: "Welcome", body: "Hi" });
	await emails(batch, { MAIL_API_KEY: "test" }, { waitUntil: vi.fn() });
	expect(send).toHaveBeenCalledOnce();
	expect(message.ack).toHaveBeenCalledOnce();
	expect(message.retry).not.toHaveBeenCalled();
});
```

Also test the failure path: make `send` reject and assert that the message is
retried, not acknowledged.

## Testing database code

Test database code through the module that owns it, with the in-memory
executor from [Test modules first](#test-modules-first). The generated
functions accept any `DbReader`, so nothing in the module changes for the
test. Run `space db doctor` to validate migrations and queries against the
schema; it is a static check and does not connect to a deployed database.

## Cloudflare vitest plugin

For integration tests against real Workers bindings, use `@cloudflare/vitest-pool-workers` with the Cloudflare Vite plugin. Add it to `vite.config.ts` and declare the bindings you need (D1, KV, DO) in the test config.

## Tips

- Co-locate tests as `*.test.ts` next to the file under test; they are ignored by the scanner.
- Keep rules in `modules/` so their tests stay plain unit tests. Route, page, and queue tests then only cover the setup: status codes, fragments, acks.
- Pass test bindings as the fourth argument to `testFetch(worker, path, init, env)` when the Worker needs `c.env`.
- Keep tests deterministic: no network, no real clocks.
- Test boundary behavior: invalid inputs, missing bindings, retries, and authorization failures matter as much as the happy path.
