# Routes and middleware

## Routes

A file in `app/routes/` answers HTTP requests. Give `route` one `Effect` per method:

```ts
import { Effect, Option, Schema } from "effect";
import { Input, NotFound, route } from "spacefn";

// app/routes/todos/[id].ts → /todos/:id
import MainDb from "#space/db/main.ts";

export default route({
	GET: Effect.gen(function* () {
		const { id } = yield* Input.params(Schema.Struct({ id: Schema.FiniteFromString }));
		const todo = yield* MainDb.findTodo({ id });
		if (Option.isNone(todo)) return yield* new NotFound({ message: `No todo ${id}` });
		return todo.value;
	}),
	DELETE: Effect.gen(function* () {
		const { id } = yield* Input.params(Schema.Struct({ id: Schema.FiniteFromString }));
		yield* MainDb.deleteTodo({ id });
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

A `_middleware.ts` file wraps requests. `next` is the rest of the request: run code before it, change its response after, or answer without it.

```ts
// app/routes/_middleware.ts
import { Effect } from "effect";
import { HttpServerResponse } from "effect/http";
import { csrf, middleware } from "spacefn";

export default [
	csrf(),
	middleware((next) => Effect.map(next, HttpServerResponse.setHeader("x-frame-options", "DENY"))),
];
```

Export one middleware, or an array that runs in order, the first outermost.

- `app/routes/_middleware.ts` wraps every request, pages and routes alike, and the 404 for a URL nothing serves.
- One in a folder below wraps only the pages and routes in that folder and its subfolders, inside the outer ones. `app/routes/admin/_middleware.ts` guards `/admin/...` and nothing else:

```ts
// app/routes/admin/_middleware.ts
import { Effect } from "effect";
import { HttpServerRequest } from "effect/http";
import { middleware, Unauthorized } from "spacefn";

export default middleware((next) =>
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		if (request.headers["x-admin-key"] !== "let-me-in")
			return yield* new Unauthorized({ message: "Admins only" });
		return yield* next;
	}),
);
```

A `(group)` folder works too, so `(account)/_middleware.ts` covers its pages without adding to their URLs.

### CSRF

New apps have it in `app/routes/_middleware.ts`:

```ts
export default csrf();
```

It refuses state-changing requests (anything but `GET`, `HEAD` and `OPTIONS`) that a browser marks as cross-site, through `Origin` or `Sec-Fetch-Site`, with a `403`. Browsers always send one of them, so that covers login CSRF too. Requests with neither header come from other clients and pass, unless you name your session cookie: with `csrf({ cookie: "session" })`, one that carries it is refused. `origins` lists other origins allowed to post, such as an admin site.
