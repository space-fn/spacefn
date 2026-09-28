> ⚠️ **DEPRECATED** — Use `@spacefn/asteroids` with Hono instead.

# @spacefn/server (deprecated)

`@spacefn/server` was the h3-based runtime for SpaceFn's file-based routes, pages, and middleware. It has been replaced by Hono-based routing in `@spacefn/asteroids`.

## Migration

Replace `@spacefn/server` with `@spacefn/asteroids` + `hono`:

```bash
pnpm remove @spacefn/server
pnpm add @spacefn/asteroids hono
```

Update imports:

```ts
// Before
import { createServer } from "@spacefn/server";
import { defineRoute } from "@spacefn/server";
import type { MiddlewareHandler } from "@spacefn/server";

// After
import { Hono } from "hono";
import { defineRoute, defineLoader } from "@spacefn/asteroids/hono";
import type { MiddlewareHandler } from "hono";
```

See [framework.md](./framework.md) and [getting-started.md](./getting-started.md) for the current approach.
