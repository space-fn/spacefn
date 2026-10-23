# Handlers

## Route handlers

```ts
import { defineHandler } from "spacefn";

export const GET = defineHandler((c) => {
	return { ok: true };
});
```

A returned `Response` passes through, a string becomes text, `undefined` becomes `204`, anything else becomes JSON.

### Error handling

Pass `onError` to handle thrown errors:

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

If omitted, errors are logged and a generic `500` JSON response is returned.

## Global error handler

In `app/entry.ts`, set a global handler on the Hono app:

```ts
app.onError((err, c) => c.json({ error: "internal_error" }, 500));
```
