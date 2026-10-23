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

A returned `Response` passes through, a string becomes text, `undefined` becomes `204`, anything else becomes JSON. See [handlers.md](./handlers.md) for error handling, validation, and middleware interaction.

- Files starting with `_` are ignored.
- A route and a page cannot serve the same path. The build stops if they do.
