# Pages

A file in `app/routes/` whose default export is a `page(...)` is a server-rendered page. `page` takes a `loader` (what the page needs), `actions` (what its forms do) and `render` (the HTML). The page connects them to the feature's code in `modules/`: what to do with todos, and how they look.

```ts [modules/todos/todos.ts]
import { Effect, Option, Schema } from "effect";
import { NotFound } from "spacefn";

import MainDb from "#space/db/main.ts";

export const Rename = Schema.Struct({ id: Schema.FiniteFromString, title: Schema.NonEmptyString });

export const find = (id: number) =>
	Effect.flatMap(MainDb.findTodo({ id }), (todo) =>
		Option.isSome(todo)
			? Effect.succeed(todo.value)
			: Effect.fail(new NotFound({ message: `No todo ${id}` })),
	);

export const rename = ({ id, title }: typeof Rename.Type) => MainDb.renameTodo({ id, title });
```

```ts [modules/todos/views.ts]
import { html } from "spacefn";

/** A form to rename the todo, posting to `rename`. */
export const renameForm = (props: {
	readonly todo: { readonly id: number; readonly title: string };
	readonly rename: string;
}) =>
	html`<form method="post" action="${props.rename}">
		<input type="hidden" name="id" value="${props.todo.id}" />
		<input name="title" value="${props.todo.title}" />
		<button>Rename</button>
	</form>`;
```

```ts [app/routes/todos/[id].ts]
import { Effect, Schema } from "effect";
import { action, Input, page, redirect } from "spacefn";

import { layout } from "#lib/ui/layout.ts";
import * as Todos from "#modules/todos/todos.ts";
import { renameForm } from "#modules/todos/views.ts";

// /todos/:id
export default page({
	loader: Effect.gen(function* () {
		const { id } = yield* Input.params(Schema.Struct({ id: Schema.FiniteFromString }));
		return yield* Todos.find(id);
	}),
	actions: {
		rename: action({
			input: Todos.Rename,
			handler: (todo) => Effect.as(Todos.rename(todo), redirect(`/todos/${todo.id}`)),
		}),
	},
	render: (ctx) =>
		layout(ctx.data.title, renameForm({ todo: ctx.data, rename: ctx.actions.rename.url })),
});
```

Keep `loader` and `actions` before `render`, so TypeScript can type `ctx`. Write the loader with `Effect.gen` or `.pipe`; TypeScript can't infer its type through the data-first `Effect.map(effect, fn)`.

## The loader

An `Effect` that reads input (`Input.params`, `Input.query`), uses services, and returns `ctx.data`. It can fail with the errors of [Routes](2-routes.md) (`NotFound` is a 404 page), or return a response to answer instead of rendering, such as `redirect("/login")`.

## Actions

Each action is `action({ method?, input, handler })`, reached at `ctx.actions.<name>.url` (`?__action=<name>` on the page's own URL). Where there's no `ctx`, as in a live action that renders part of the page again, `actionUrl("<name>")` gives the same URL:

- **`post`** (the default) decodes the form, a multipart body, or the JSON a Datastar `@post` sends.
- **`get`** decodes the query string, or the signals of a Datastar `@get`.

When the input decodes, `handler` runs. Return a response such as `redirect(...)` to send it, which is right after a form post (the browser then reloads the page with `GET`). Return anything else and the page renders again with it as `ctx.actions.<name>.data`.

When the input doesn't decode, the page renders again with status `422` and `ctx.actions.<name>.error`, typed from the action's input. `fields` holds the first message for each field, `issues` every issue with its dotted `path`, and `values` what was sent, so the form can show it back:

```ts
<input name="title" value="${ctx.actions.rename.error?.values.title ?? ctx.data.title}" />
${ctx.actions.rename.error?.fields.title && html`<p role="alert">${ctx.actions.rename.error.fields.title}</p>`}
```

`ctx.actions.<name>.ok` says whether this render answers a submission of that action: `true` when its handler ran (so a handler that returns nothing still shows as done), `false` when its input didn't decode, and `undefined` otherwise, when `error` and `data` are `undefined` too.

## HTML

`` html`...` `` escapes every value, so user input is safe to interpolate. Arrays render each item, and `null`, `undefined` and `false` render nothing. `raw(string)` inserts markup you trust as it is. Routes can return `html` too.

## Scripts, styles and public files

A page loads the browser code it needs with `assets("name")`, for the entries in `app/client/`. [Frontend](4-frontend.md) covers them, `public/`, CSS, client components from React, Vue, Solid or Svelte, and how to write Datastar components.

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
html`<main data-init="@get('${ctx.actions.live.url}')">${ctx.data.list}</main>`;
```

When the page loads, Datastar opens the action. `watch` subscribes to the `todos` topic on the [Bus](6-services.md), sends `todoList`'s HTML, and sends it again after each message, until the tab closes. Datastar swaps elements in by `id`, so give the rendered elements one. Anything that changes the todos publishes the topic, from a page, a route, a queue consumer or a cron:

```ts
yield * Bus.publish("todos", "changed");
```

A burst of messages causes one re-render. How to name the ids and signals, and split the markup into components, is in [Frontend](4-frontend.md#datastar). For more control, `Datastar.sse(stream)` sends your own events, built with `Datastar.patchElements`, `removeElements`, `patchSignals` and `executeScript`. `Datastar.signals(schema)` decodes the signals a request sent, and `Datastar.isRequest` tells a Datastar request from a plain one.

## Error pages

When a browser navigates to a page and the loader fails, it gets a small HTML page with the status, such as "404 Not Found", and the error's message. Datastar requests, `fetch` and API clients get the JSON error instead. A custom error page isn't supported yet; until then, catch the error in the loader and render your own.
