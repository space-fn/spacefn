# Routes

`app/routes/` holds HTTP endpoints. Each file becomes a route; each named export (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) becomes a method handler.

## Layout

```txt
app/routes/
├── index.ts              → GET /
├── hello.ts              → GET /hello
├── todos.ts              → GET /todos, POST /todos
├── todos/
│   └── [id].ts           → GET /todos/:id, ...
└── users/
    └── [id].ts           → GET /users/:id
```

Nested folders become path segments. `[id]` is a dynamic segment.

## A route file

```ts
// app/routes/todos.ts
import { defineHandler } from "spacefn";

export const GET = defineHandler((c) => {
	return { items: [] };
});

export const POST = defineHandler(async (c) => {
	const body = await c.req.json();
	return { created: body };
});
```

A returned `Response` passes through, a string becomes text, `undefined` becomes `204`, anything else becomes JSON.

- Files starting with `_` are ignored.
- A route and a page cannot serve the same path. The build stops if they do.

## Handlers

Each named export is wrapped with `defineHandler`:

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
