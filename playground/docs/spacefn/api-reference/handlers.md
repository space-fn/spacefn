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

If `onError` is omitted, the error is rethrown to the app's `app.onError`. The generated `createApp` registers spacefn's `onError` there by default, so an app that does not replace it gets status-bearing JSON for framework errors and a generic `500` for the rest.

`Handler` is the typed `(c) => result` function accepted by `defineHandler`;
`HandlerResult` is `unknown`. `HandlerOptions.onError(error, c)` can return a
custom `Response` synchronously or asynchronously.

## Global error handler

In `app/entry.ts`, wrap the default to translate your own errors:

```ts
app.onError((error, c) =>
	error instanceof AppError
		? c.json({ error: error.code, message: error.message }, STATUS[error.kind])
		: onError(error, c),
);
```

Route handlers and page loaders and actions all throw into this handler, so it is the one place errors become responses. See [modules](../directory-structure/modules.md#errors-cross-the-boundary-as-apperror) for `AppError`.

`onError(error, c)` is exported from `spacefn/handler` (and `spacefn/runtime`, for custom runtimes). It maps a `SpaceError`
with an HTTP status from 400 through 599 to `{ error: code, message }`; other
errors are logged and return a generic 500 response.

See [routes](../directory-structure/routes.md) for file naming and registration.
