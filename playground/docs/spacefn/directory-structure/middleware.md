# Middleware

`app/middleware/` holds one middleware per file. Each file default-exports a middleware; files run in name order.

## Layout

```txt
app/middleware/
├── 01-powered-by.ts
├── 02-timing.ts
├── 03-session.ts
├── 04-csrf.ts
├── 05-login-limit.ts
└── _helpers.ts          → ignored
```

## A middleware

```ts
// app/middleware/01-powered-by.ts
import { defineMiddleware } from "spacefn/middleware";

export default defineMiddleware(async (c, next) => {
	await next();
	c.res.headers.set("x-powered-by", "spacefn");
});
```

- Files run in name order. Use numeric prefixes such as `01-auth.ts` and `02-audit.ts` to set the order.
- Files starting with `_` are ignored.
- Middleware runs after tracing and env validation, so it is traced and can read `env`.
- Each middleware wraps the handler: code before `await next()` runs on the way in, code after it runs on the way out.

## Before and after the handler

```ts
// app/middleware/02-timing.ts
import { defineMiddleware } from "spacefn/middleware";

export default defineMiddleware(async (c, next) => {
	const start = Date.now();
	await next(); // routes, pages and later middleware run here
	c.res.headers.set("server-timing", `app;dur=${Date.now() - start}`);
});
```

## Stop a request early

Return a response instead of calling `next()`. Nothing after this middleware runs.

```ts
// app/middleware/02-maintenance.ts
import { defineMiddleware } from "spacefn/middleware";

export default defineMiddleware((c, next) => {
	if (c.env.MAINTENANCE === "true") return c.text("Back soon", 503);
	return next();
});
```

## Apply to some paths only

A middleware sees every request, so check the path or method yourself:

```ts
// app/middleware/06-admin-guard.ts
import { defineMiddleware } from "spacefn/middleware";

export default defineMiddleware((c, next) => {
	if (!c.req.path.startsWith("/admin")) return next();
	if (c.req.header("authorization") !== `Bearer ${c.env.ADMIN_TOKEN}`) {
		return c.json({ error: "unauthorized" }, 401);
	}
	return next();
});
```

## Pass data to handlers

Store a value with `c.set` and read it in any later middleware, route, or page action with `c.get`:

```ts
// app/middleware/03-request-id.ts
import { defineMiddleware } from "spacefn/middleware";

export default defineMiddleware(async (c, next) => {
	const id = c.req.header("x-request-id") ?? crypto.randomUUID();
	c.set("requestId", id);
	await next();
	c.res.headers.set("x-request-id", id);
});
```

```ts
// app/routes/whoami.ts
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler((c) => ({ requestId: c.get("requestId") }));
```

## Reuse Hono middleware

Anything written for Hono works, because `defineMiddleware` takes a Hono middleware handler:

```ts
// app/middleware/02-cors.ts
import { cors } from "hono/cors";
import { defineMiddleware } from "spacefn/middleware";

export default defineMiddleware(
	cors({ origin: ["https://example.com"], allowMethods: ["GET", "POST"] }),
);
```

## Built-in auth middleware

`spacefn/auth` provides ready-made middleware factories. The playground wires three of them:

```ts
// app/middleware/04-csrf.ts
import { csrfGuard } from "spacefn/auth";
import { defineMiddleware } from "spacefn/middleware";

/** Refuses cross-site changes made with a session cookie. */
export default defineMiddleware(csrfGuard({ cookie: "session", origins: [] }));
```

```ts
// app/middleware/05-login-limit.ts
import { clientKey, memoryRateStore, rateLimit } from "spacefn/auth";
import { defineMiddleware } from "spacefn/middleware";

const guard = rateLimit({
	store: memoryRateStore(),
	limit: 5,
	windowMs: 60_000,
	key: (c) => `login:${clientKey(c)}`,
});

// Rate limit only the sign-in route.
export default defineMiddleware((c, next) =>
	c.req.method === "POST" && c.req.path === "/auth/login" ? guard(c, next) : next(),
);
```

The session middleware (`03-session.ts`) is covered in the [auth guide](../guides/auth.md).

## Related

- [Middleware API](../api-reference/middleware.md)
- [Routes](./routes.md) run after all middleware.
- [Tracing](../guides/tracing.md) explains why middleware spans appear in traces.
