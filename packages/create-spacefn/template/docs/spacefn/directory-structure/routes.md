# Routes

`app/routes/` holds HTTP endpoints. Each file becomes a route; each named export (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, or `OPTIONS`) becomes a method handler.

For HTML that updates in place, use [Datastar](../guides/datastar.md) with [pages](./pages.md) and `*.server.ts` actions. Routes are the right tool for JSON APIs, webhooks, uploads, redirects, and anything that is not a page.

## Layout

```txt
app/routes/
├── index.ts              → GET /
├── hello.ts              → GET /hello
├── todos.ts              → GET /todos, POST /todos
├── todos/
│   └── [id].ts           → GET /todos/:id, ...
├── files/
│   └── [...path].ts      → GET /files/a/b/c.png
├── (admin)/
│   └── stats.ts          → GET /stats
├── debug.dev.ts          → GET /debug (dev only)
└── _helpers.ts           → not a route
```

| File name           | URL               | Notes                                                         |
| ------------------- | ----------------- | ------------------------------------------------------------- |
| `index.ts`          | the folder's path | `routes/index.ts` is `/`, `routes/users/index.ts` is `/users` |
| `[id].ts`           | `/:id`            | One segment. Read it with `c.req.param("id")`                 |
| `[...path].ts`      | `/:path{.+}`      | One or more segments. `c.req.param("path")` is `"a/b/c.png"`  |
| `(group)/`          | nothing           | Organises files without changing the URL                      |
| `name.dev.ts`       | `/name`           | Only exists in development                                    |
| `name.prod.ts`      | `/name`           | Only exists in builds                                         |
| `_name.ts`, `_dir/` | not a route       | Any segment starting with `_` is ignored                      |

When several routes match, the most specific wins: static segments, then `[id]`, then `[...path]`. A bracket segment that is not a valid parameter (`[id!]`) stops the build with `ROUTE_BAD_PARAM`; use letters, digits, `_` and `-`.

## A route file

```ts
// app/routes/todos.ts
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler((c) => {
	return { items: [] };
});

export const POST = defineHandler(async (c) => {
	const body = await c.req.json();
	return { created: body };
});
```

- A route and a page cannot serve the same path. The build stops if they do.
- A file that exports no method handler fails with `ROUTE_NO_HANDLERS`.
- Export `OPTIONS` to answer preflight requests.

## Return values

`defineHandler` turns whatever you return into a `Response`:

| Return                  | Response                 |
| ----------------------- | ------------------------ |
| a `Response`            | passed through unchanged |
| a `string`              | `text/plain`             |
| `undefined` (no return) | `204 No Content`         |
| anything else           | JSON, status `200`       |

```ts
// app/routes/examples.ts
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler((c) => {
	const kind = c.req.query("kind");

	if (kind === "text") return "plain text"; // text/plain
	if (kind === "none") return; // 204
	if (kind === "created") return c.json({ id: 1 }, 201); // custom status
	if (kind === "gone") return c.json({ error: "gone" }, 410);
	if (kind === "redirect") return c.redirect("/hello", 302);
	if (kind === "headers") {
		return new Response("custom", { headers: { "cache-control": "max-age=60" } });
	}
	return { kind }; // JSON
});
```

## Reading the request

```ts
// app/routes/search/[section].ts
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler(async (c) => {
	const section = c.req.param("section"); // from the file name
	const q = c.req.query("q") ?? ""; // ?q=...
	const page = Number(c.req.query("page") ?? 1); // ?page=2
	const tags = c.req.queries("tag") ?? []; // ?tag=a&tag=b
	const token = c.req.header("authorization"); // request header

	return { section, q, page, tags, hasToken: Boolean(token) };
});

export const POST = defineHandler(async (c) => {
	const json = await c.req.json<{ title: string }>(); // application/json
	return { title: json.title };
});
```

Forms and uploads:

```ts
// app/routes/contact.ts
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const form = await c.req.formData(); // multipart or urlencoded
	const email = String(form.get("email") ?? "");
	return { received: email };
});
```

For file uploads with size and type limits, see [file upload to R2](../examples/file-upload.md).

## Using bindings

`c.env` holds your Worker bindings, typed from `.space/`:

```ts
// app/routes/todos/[id].ts
import { findTodo } from "@space/db/main_db";
import { d1Executor } from "spacefn/db";
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler(async (c) => {
	const todo = await findTodo(d1Executor(c.env.DB), { id: Number(c.req.param("id")) });
	return todo ?? c.json({ error: "not found" }, 404);
});
```

## Errors

Return an error response for failures you expect:

```ts
// app/routes/todos/[id].ts
import { defineHandler } from "spacefn/handler";

export const DELETE = defineHandler(async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) return c.json({ error: "id must be a whole number" }, 400);
	return { deleted: id };
});
```

A thrown error is caught by `defineHandler`. Framework helpers such as `readUploads` and `requireWebSocket` throw errors that carry a status (`413`, `415`, `426`, ...), and the default handler answers with that status and a JSON body. Any other error is logged and answered with a generic `500`.

```json
{ "error": "internal_error", "message": "Something went wrong" }
```

Pass `onError` to handle errors for one handler:

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

### Global error handler

`app/entry.ts` registers the same default handler on the Hono app. Replace it to change the shape of every error response:

```ts
app.onError((err, c) => c.json({ error: "internal_error" }, 500));
```

## Related

- [Middleware](./middleware.md) runs before every route.
- [Handlers API](../api-reference/handlers.md) lists the exact signatures.
- [Database](./database.md), [queues](./queues.md) and [auth guide](../guides/auth.md) show routes with bindings.
