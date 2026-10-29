# Handlers

## `defineHandler`

```ts
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler((c) => {
	return { ok: true };
});
```

A returned `Response` passes through, a string becomes text, `undefined` becomes `204`, anything else becomes JSON. This also supports streaming responses; see [Streaming and SSE](./streaming.md).

### Error handling

```ts
export const GET = defineHandler(
	(c) => {
		throw new Error("boom");
	},
	{
		onError: (error, c) => c.json({ error: "boom" }, 500),
	},
);
```

If `onError` is omitted, errors are logged and a generic `500` JSON response is returned.

`Handler` is the typed `(c) => result` function accepted by `defineHandler`;
`HandlerResult` is `unknown`. `HandlerOptions.onError(error, c)` can return a
custom `Response` synchronously or asynchronously.

## Global error handler

In `app/entry.ts`:

```ts
app.onError((err, c) => c.json({ error: "internal_error" }, 500));
```

`onError(error, c)` is also exported for custom runtimes. It maps a `SpaceError`
with an HTTP status from 400 through 599 to `{ error: code, message }`; other
errors are logged and return a generic 500 response.

See [routes](../directory-structure/routes.md) for file naming and registration.
