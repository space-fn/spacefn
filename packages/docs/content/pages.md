# Pages

A file in `app/routes/` whose default export is a `page(...)` is a server-rendered page. `page` takes a `loader` (what the page needs), `actions` (what its forms do) and `render` (the HTML):

```ts
import { Effect, Option, Schema } from "effect";
import { action, html, Input, NotFound, page, redirect } from "spacefn";

// app/routes/todos/[id].ts → /todos/:id
import MainDb from "#space/db/main.ts";

import { layout } from "../_layout.ts";

export default page({
	loader: Effect.gen(function* () {
		const { id } = yield* Input.params(Schema.Struct({ id: Schema.FiniteFromString }));
		const todo = yield* MainDb.findTodo({ id });
		if (Option.isNone(todo)) return yield* new NotFound({ message: `No todo ${id}` });
		return todo.value;
	}),
	actions: {
		rename: action({
			input: Schema.Struct({ id: Schema.FiniteFromString, title: Schema.NonEmptyString }),
			handler: ({ id, title }) =>
				Effect.gen(function* () {
					yield* MainDb.renameTodo({ id, title });
					return redirect(`/todos/${id}`);
				}),
		}),
	},
	render: (ctx) =>
		layout(
			ctx.loaderData.title,
			html`<form method="post" action="${ctx.actions.rename.url}">
				<input type="hidden" name="id" value="${ctx.loaderData.id}" />
				<input name="title" value="${ctx.loaderData.title}" />
				<button>Rename</button>
			</form>`,
		),
});
```

Keep `loader` and `actions` before `render`, so TypeScript can type `ctx`. Write the loader with `Effect.gen` or `.pipe`; TypeScript can't infer its type through the data-first `Effect.map(effect, fn)`.

## The loader

An `Effect` that reads input (`Input.params`, `Input.query`), uses services, and returns `ctx.loaderData`. It can fail with the errors of [Routes](routes.md) (`NotFound` is a 404 page), or return a response to answer instead of rendering, such as `redirect("/login")`.

## Actions

Each action is `action({ method?, input, handler })`, reached at `ctx.actions.<name>.url` (`?__action=<name>` on the page's own URL):

- **`post`** (the default) decodes the form, a multipart body, or the JSON a Datastar `@post` sends.
- **`get`** decodes the query string, or the signals of a Datastar `@get`.

When the input decodes, `handler` runs. Return a response such as `redirect(...)` to send it, which is right after a form post (the browser then reloads the page with `GET`). Return anything else and the page renders again with `ctx.action = { name, ok: true, data }`.

When the input doesn't decode, the page renders again with status `422` and `ctx.action = { name, ok: false, issues, values }`: each issue has a `path` and `message`, and `values` holds what was sent, so the form can show it back:

```ts
${ctx.action?.name === "rename" && !ctx.action.ok
	? ctx.action.issues.map((issue) => html`<p role="alert">${issue.path}: ${issue.message}</p>`)
	: ""}
```

## HTML

`` html`...` `` escapes every value, so user input is safe to interpolate. Arrays render each item, and `null`, `undefined` and `false` render nothing. `raw(string)` inserts markup you trust as it is. Routes can return `html` too.

The layout puts `head` from `spacefn/assets` in `<head>`: the `<script>` and `<link>` tags of every file in `app/client/`. In dev they point at the sources and Vite's live reload; in a build, at the hashed files, with their CSS and preloads.

```ts
import { head } from "spacefn/assets";
html`<head>
	${head}
</head>`;
```

## Live updates with Datastar

Pages speak [Datastar](https://data-star.dev): the new app's layout loads its client from a CDN (or install it and import it from `app/client/`). A `get` action that returns `Datastar.watch(topics, render)` keeps part of the page current:

```ts
live: action({
	method: "get",
	input: Schema.Struct({}),
	handler: () => Datastar.watch(["todos"], todoList),
}),
```

```ts
html`<main data-init="@get('${ctx.actions.live.url}')">${ctx.loaderData.list}</main>`;
```

When the page loads, Datastar opens the action. `watch` subscribes to the `todos` topic on the [Bus](services.md), sends `todoList`'s HTML, and sends it again after each message, until the tab closes. Datastar swaps elements in by `id`, so give the rendered elements one. Anything that changes the todos publishes the topic, from a page, a route, a queue consumer or a cron:

```ts
yield * Bus.publish("todos", "changed");
```

A burst of messages causes one re-render. For more control, `Datastar.sse(stream)` sends your own events, built with `Datastar.patchElements`, `removeElements`, `patchSignals` and `executeScript`. `Datastar.signals(schema)` decodes the signals a request sent, and `Datastar.isRequest` tells a Datastar request from a plain one.

## Error pages

When a browser navigates to a page and the loader fails, it gets a small HTML page with the status, such as "404 Not Found", and the error's message. Datastar requests, `fetch` and API clients get the JSON error instead. A custom error page isn't supported yet; until then, catch the error in the loader and render your own.
