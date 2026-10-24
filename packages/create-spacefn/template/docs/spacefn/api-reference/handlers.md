# Handlers

## `defineHandler`

```ts
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler((c) => {
	return { ok: true };
});
```

A returned `Response` passes through, a string becomes text, `undefined` becomes `204`, anything else becomes JSON.

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

## Global error handler

In `app/entry.ts`:

```ts
app.onError((err, c) => c.json({ error: "internal_error" }, 500));
```

See [routes](../directory-structure/routes.md) for file naming and registration.
