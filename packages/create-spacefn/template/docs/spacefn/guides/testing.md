# Testing

spacefn apps are tested with [Vitest](https://vitest.dev) through `vite-plus`. The template ships a `test` script (`vp test`) and a Cloudflare Workers test environment.

## Running

```bash
vp test run          # one shot
vp test              # watch mode
vp test run --coverage
```

## Testing a route handler

Use `testFetch` from `vite-plus/test` (or `fetch` with the dev server) to hit a handler without a running server:

```ts
import { describe, it, expect } from "vite-plus/test";

import { GET } from "./index";

describe("index route", () => {
	it("is defined", () => {
		expect(GET).toBeDefined();
	});
});
```

## Testing database code

`d1Executor` accepts any `D1Database`. In tests, use a D1 fake or an in-memory SQLite shim, then call the generated function directly:

```ts
import { findTodo } from "@space/db/main_db";

const rows = await findTodo(executor, { id: 1 });
```

Run `space db doctor` to validate migrations and queries against the schema before tests.

## Cloudflare vitest plugin

For integration tests against real Workers bindings, use `@cloudflare/vitest-pool-workers` with the Cloudflare Vite plugin. Add it to `vite.config.ts` and declare the bindings you need (D1, KV, DO) in the test config.

## Mutation testing

Core modules are mutation-tested in CI. Run locally with `npx stryker run` where configured. Keep coverage thresholds in `vite.config.ts` in sync with `vp check`.

## Tips

- Co-locate tests as `*.test.ts` next to the file under test; they are ignored by the scanner.
- Mock `c.env` by constructing the context your handler expects.
- Keep tests deterministic: no network, no real clocks.
