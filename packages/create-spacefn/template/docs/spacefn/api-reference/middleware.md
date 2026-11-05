# Middleware API (`spacefn/middleware`)

`defineMiddleware(handler)` is a typed identity helper for middleware modules.
It returns the Hono `MiddlewareHandler` unchanged, so it adds no wrapper or
runtime behavior.

```ts
import { defineMiddleware } from "spacefn/middleware";

export default defineMiddleware(async (c, next) => {
	c.header("x-content-type-options", "nosniff");
	await next();
});
```

Use the default export from a file under `app/middleware/`. The framework
discovers those files and registers them in generated order. See the
[middleware convention](../directory-structure/middleware.md) for ordering and
application scope.

Middleware can also short-circuit before the route:

```ts
import { defineMiddleware } from "spacefn/middleware";

export default defineMiddleware((c, next) => {
	if (!c.req.header("authorization")) return c.json({ error: "unauthorized" }, 401);
	return next();
});
```

For session-based auth, CSRF, rate limits, and request-scoped values, see the
[middleware examples](../directory-structure/middleware.md).
