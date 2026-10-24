# Middleware

`app/middleware/` holds one middleware per file. Each file default-exports a middleware; files run in name order.

## Layout

```txt
app/middleware/
├── 01-powered-by.ts
├── 02-auth.ts
└── 03-rate-limit.ts
```

## A middleware

```ts
// app/middleware/01-powered-by.ts
import { defineMiddleware } from "spacefn";

export default defineMiddleware(async (c, next) => {
	await next();
	c.res.headers.set("x-powered-by", "spacefn");
});
```

- Files run in name order. Use numeric prefixes such as `01-auth.ts` and `02-audit.ts` to set the order.
- Files starting with `_` are ignored.
- Middleware runs after tracing and env validation, so it is traced and can read `env`.
- Each middleware wraps the handler: call `next()` to continue the chain.
