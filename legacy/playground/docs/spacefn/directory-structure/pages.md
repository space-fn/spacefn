# Pages

Server-rendered HTML written as template strings. No component framework or
client bundle is required. A page is a function from data to markup, and it
runs on the Worker. For interactive pages, [Datastar](../guides/datastar.md) is
the recommended frontend: add its attributes to the HTML and handle requests
with colocated `*.server.ts` actions that return fragments or SSE updates.

## Layout

```txt
app/pages/
├── index.page.ts           → GET /
├── board.page.ts           → GET /board
├── board.server.ts         loader and actions for /board
└── users/
    ├── [id].page.ts        → GET /users/:id
    └── [id].server.ts      loader and actions for /users/:id
```

`*.page.ts` renders a URL. `*.server.ts` next to it supplies the data and the form actions. Files starting with `_` are ignored. A page and a route cannot serve the same path. The build stops if they do.

Both files are setup. The page file holds the shell around your content; the server file reads the request and calls `modules/`. Fragments that render your data, and every rule about it, live in the module (see [modules](./modules.md#markup-fragments)).

## A page

```ts
// app/pages/board.page.ts

import { todoList } from "@modules/todos";
import { definePage, html } from "spacefn/pages";

import type { loader } from "./board.server";

export default definePage<typeof loader>(
	(props) =>
		html`<!doctype html>
			<html>
				<body>
					${todoList(props.todos)}
				</body>
			</html>`,
);
```

## Data and actions

```ts
// app/pages/board.server.ts

import { mainDb } from "@app/db/main_db";
import { allTodos, createTodo } from "@modules/todos";
import { defineActions, defineLoader } from "spacefn/pages";

export const loader = defineLoader(async (c) => ({
	todos: await allTodos(await mainDb(c.env.DB)),
}));

export const actions = defineActions({
	add: async (c) => {
		const form = await c.req.formData();
		await createTodo(await mainDb(c.env.DB), { title: form.get("title") });
		// return nothing: the user is redirected back to /board with 303
	},
});
```

```html
<form method="post" action="/board?_action=add">
	<input name="title" required />
	<button>Add</button>
</form>
```

- `GET` runs the loader, then renders the page with its result.
- `POST` runs the action named in `?_action=`. Return a `Response` to answer yourself, for example a download or a JSON error. Return nothing to redirect back to the page with 303, so a refresh does not submit the form again.
- A loader can return a `Response`, for example a redirect for a page the user may not see.
- A `POST` with no action name gets 400. An unknown action gets 404, including names such as `constructor`.

## Form actions and `.path()`

`defineActions` returns each action with a `.path()` method. `path()` returns the query string `?_action=<name>`, which is the value a form posts to. You can build the action string in the page instead of hard-coding it:

```ts
import { defineActions } from "spacefn/pages";

export const actions = defineActions({
	add: async (c) => {
		/* ... */
	},
	remove: async (c) => {
		/* ... */
	},
});

// in the page:
html`<form method="post" action="${actions.add.path()}">
	<input name="title" required />
	<button>Add</button>
</form>`;
```

`defineLoader` runs on `GET`. `defineActions` returns `{ [name]: action & { path(): string } }`: the action stays callable, and `path()` gives the query string for that action.

## Escaping

`html` escapes every interpolated value. Strings, numbers and nested templates are safe by default:

```ts
html`<p>${userComment}</p>`; // <script> in the comment is shown as text
```

- Arrays are joined, so `${items.map(...)}` works.
- `null`, `undefined` and `false` render nothing, so `${cond ? html`...` : null}` works.
- `raw(markup)` places markup unchanged. Use it only for markup you built yourself.
- The render returns `html` output or `raw()` markup. Returning a plain string is a type error, and is escaped at run time if one slips through a cast.

**Formatters rewrite the markup.** An `html` template is HTML to Prettier-style formatters, which reflow its whitespace and indentation. The browser ignores most of that, but whitespace inside `<pre>`, or between inline elements, can change what the user sees. Keep those spans out of templates the formatter touches, or put them in `raw()` strings.

## HTML helpers

`html` is the only escaping template tag. Two helpers ship alongside it. Import them from `spacefn/pages` or `spacefn/html`:

- `raw(markup)` places markup unchanged.
- `minifyHtml(input)` collapses whitespace between tags and trims, while preserving content inside `<pre>`, `<code>`, `<textarea>`, `<script>` and `<style>`. Opt-in; `html` itself keeps whitespace.
- `css` is a tagged template for CSS text. It splices values in and prevents `</style>` breakout.

```ts
import { css, html, minifyHtml } from "spacefn/pages";

const color = "red";
const sheet = css`
	.box {
		color: ${color};
	}
`;

const markup = minifyHtml(
	html`<div>
		<p>hello</p>
	</div>`,
);
```

## Interactivity

Pages can render Datastar attributes in their HTML. Load the Datastar browser
bundle in the page shell, then use `data-signals`, `data-bind`, and `data-on:*`
for browser state and backend actions. See the [Datastar guide](../guides/datastar.md)
for complete route and page examples.

## Limits

- The loader's data reaches the page unchecked at run time. Use `definePage<typeof loader>` to keep the page's props in step with its loader; the two are fully decoupled with `definePage<{ ... }>` and mismatched types are not caught across files.
- Pages do not support environment suffixes such as `.dev`.
- Pages do not provide layouts yet. Share a head or shell with a function that returns `html`, in a setup file such as `app/pages/_layout.ts`.
