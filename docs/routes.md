# Routes and middleware

## Routes

A file in `app/routes/` answers HTTP requests. Give `route` one `Effect` per method:

```ts
// app/routes/todos/[id].ts → /todos/:id
import MainDb from "@space/db/main.ts";
import { Effect, Option, Schema } from "effect";
import { Input, NotFound, route } from "spacefn";

export default route({
	GET: Effect.gen(function* () {
		const { id } = yield* Input.params(Schema.Struct({ id: Schema.FiniteFromString }));
		const todo = yield* (yield* MainDb).findTodo({ id });
		if (Option.isNone(todo)) return yield* new NotFound({ message: `No todo ${id}` });
		return todo.value;
	}),
	DELETE: Effect.gen(function* () {
		const { id } = yield* Input.params(Schema.Struct({ id: Schema.FiniteFromString }));
		yield* (yield* MainDb).deleteTodo({ id });
	}),
});
```

What the handler returns becomes the response:

| Returned                                 | Response         |
| ---------------------------------------- | ---------------- |
| a value                                  | JSON             |
| a string                                 | `text/plain`     |
| `` html`...` ``                          | `text/html`      |
| nothing (`undefined`)                    | `204 No Content` |
| an `HttpServerResponse`, `redirect("/")` | sent as it is    |

A method the file doesn't handle is `405` with an `Allow` header, and an unknown URL is `404`.

## Input

Read the request with a [Schema](https://effect.website/docs/schema/introduction); input that doesn't decode never reaches your code.

- `Input.params(schema)`: path parameters. One that doesn't decode is a `404` (the URL names nothing), not a `400`.
- `Input.query(schema)`: the query string. Repeated keys arrive as arrays.
- `Input.body(schema, limits?)`: JSON, a URL-encoded form, or multipart. Files arrive as `Upload`s; check them with the `Upload` schema. Too large is `413`, an unexpected content or file type `415`, anything that doesn't match `400` with the issues listed by field.

Use `Schema.FiniteFromString` for numbers in params and forms.

## Errors

Fail with spacefn's errors and they become their status:

| Error                  | Status                  |
| ---------------------- | ----------------------- |
| `BadRequest`           | 400                     |
| `Unauthorized`         | 401                     |
| `Forbidden`            | 403                     |
| `NotFound`             | 404                     |
| `Conflict`             | 409                     |
| `PayloadTooLarge`      | 413                     |
| `UnsupportedMediaType` | 415                     |
| `TooManyRequests`      | 429, with `Retry-After` |

The body is JSON, `{ "error": "NotFound", "message": "No todo 7" }`. A browser navigating to a page gets a plain HTML error page with the same status instead. Any other failure or defect is logged with its full cause and answered with an opaque `500`, so internals never reach the client. They're schema-backed tagged errors, so `Effect.catchTag("NotFound", ...)` works.

## Middleware

A file in `app/middleware/` wraps every request, pages and routes alike. `next` is the rest of the request: run code before it, change its response after, or answer without it.

```ts
// app/middleware/2-headers.ts
import { Effect } from "effect";
import { HttpServerResponse } from "effect/http";
import { middleware } from "spacefn";

export default middleware((next) =>
	Effect.map(next, HttpServerResponse.setHeader("x-frame-options", "DENY")),
);
```

Files run in name order, the first outermost.

### CSRF

New apps have `app/middleware/1-csrf.ts`:

```ts
export default csrf();
```

It refuses state-changing requests (anything but `GET`, `HEAD` and `OPTIONS`) that a browser marks as cross-site, through `Origin` or `Sec-Fetch-Site`, with a `403`. Browsers always send one of them, so that covers login CSRF too. Requests with neither header come from other clients and pass, unless you name your session cookie: with `csrf({ cookie: "session" })`, one that carries it is refused. `origins` lists other origins allowed to post, such as an admin site.
