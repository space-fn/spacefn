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

A queue consumer is a function. Build a small batch and assert the behavior
you care about:

```ts
import { expect, test, vi } from "vite-plus/test";

vi.mock("@lib/email", () => ({ sendEmail: vi.fn() }));

import { sendEmail } from "@lib/email";

import emails from "../app/queues/emails";

test("acknowledges a delivered email", async () => {
	const ack = vi.fn();
	const retry = vi.fn();
	const batch = {
		queue: "emails",
		messages: [
			{
				id: "message-1",
				body: { to: "a@example.test", subject: "Welcome" },
				attempts: 1,
				ack,
				retry,
			},
		],
		ackAll: vi.fn(),
		retryAll: vi.fn(),
	};

	await emails(batch, {}, { waitUntil: vi.fn() });
	expect(sendEmail).toHaveBeenCalledOnce();
	expect(ack).toHaveBeenCalledOnce();
	expect(retry).not.toHaveBeenCalled();
});
```

Inject or mock the email provider in your app so this test never sends a real
message. Also test the failure path and assert that the message is retried.

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
- Test boundary behavior: invalid inputs, missing bindings, retries, and authorization failures matter as much as the happy path.
