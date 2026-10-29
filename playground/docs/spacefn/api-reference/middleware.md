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
