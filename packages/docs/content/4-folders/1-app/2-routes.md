---
title: routes/
icon: route
---

# app/routes/

A file per URL. The path of a file is the URL it answers, and its default export says how: a `page(...)` is a server-rendered page with forms, a `route(...)` answers per HTTP method.

```txt
app/routes/
├── _middleware.ts         wraps every request
├── index.ts               /
├── about.ts               /about
├── health.ts              /health
├── todos/
│   ├── index.ts           /todos
│   └── [id].ts            /todos/:id
├── files/
│   └── [...path].ts       /files/*
├── (admin)/
│   ├── _middleware.ts     wraps only the files in (admin)/
│   └── users.ts           /users
└── debug.dev.ts           /debug, only under space dev
```

## File names

| Name             | Matches                                               |
| ---------------- | ----------------------------------------------------- |
| `index.ts`       | the folder's own URL                                  |
| `about.ts`       | `/about`                                              |
| `[id].ts`        | one segment, read with `Input.params`                 |
| `[...path].ts`   | the rest of the path, as `path`                       |
| `(group)/`       | nothing: a group organizes files without a URL        |
| `_middleware.ts` | wraps the requests to its folder and the ones below   |
| `_anything.ts`   | nothing: private, never a page or route               |
| `name.dev.ts`    | only under `space dev`; `name.prod.ts` only in builds |

Parameter names are identifiers (`[userId]`, not `[user-id]`). Two files for the same URL shape, such as `[id].ts` and `[slug].ts` in one folder, are an error from `space gen`, and so is a file in [`public/`](../4-public.md) at a route's URL.

## A route

```ts [app/routes/todos/[id].ts]
import { Effect, Schema } from "effect";
import { Input, route } from "spacefn";

import * as Todos from "#modules/todos/todos.ts";

const id = Effect.map(Input.params(Schema.Struct({ id: Schema.FiniteFromString })), (p) => p.id);

export default route({
	GET: Effect.flatMap(id, Todos.find),
	DELETE: Effect.flatMap(id, Todos.remove),
});
```

A value is answered as JSON, a string as text, `` html`...` `` as HTML, nothing as `204`. A method the file doesn't handle is `405`.

## A page

```ts [app/routes/index.ts]
import { Effect } from "effect";
import { action, page, redirect } from "spacefn";

import { layout } from "#lib/ui/layout.ts";
import * as Todos from "#modules/todos/todos.ts";
import { todosPage } from "#modules/todos/views.ts";

export default page({
	loader: Effect.map(Todos.list, (todos) => ({ todos })),
	actions: {
		add: action({
			input: Todos.NewTodo,
			handler: (todo) => Effect.as(Todos.add(todo), redirect("/")),
		}),
	},
	render: (ctx) => layout("Todos", todosPage({ todos: ctx.data.todos, add: ctx.actions.add.url })),
});
```

## Middleware

`_middleware.ts` exports one `middleware(...)`, or an array that runs in order. The one at the top wraps every request, including the 404 for a URL nothing serves; one in a folder wraps that folder and its subfolders, inside the outer ones.

```ts [app/routes/_middleware.ts]
import { csrf } from "spacefn";

export default csrf();
```

Read more in [Routes and middleware](../../6-guides/2-routes.md) and [Pages](../../6-guides/3-pages.md).
