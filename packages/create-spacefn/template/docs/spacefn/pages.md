# Pages

Server-rendered HTML written as template strings. No component framework and no client bundle. A page is a function from data to markup, and it runs on the Worker.

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

## A page

```ts
// app/pages/board.page.ts
import { definePage, html } from "spacefn/pages";

export default definePage<{ todos: { title: string }[] }>(
	(props) =>
		html`<!doctype html>
			<html>
				<body>
					<ul>
						${props.todos.map((todo) => html`<li>${todo.title}</li>`)}
					</ul>
				</body>
			</html>`,
);
```

## Data and actions

```ts
// app/pages/board.server.ts
import { defineActions, defineLoader } from "spacefn/pages";

export const loader = defineLoader(async (c) => ({
	todos: await listTodos(c.env.DB, {}),
}));

export const actions = defineActions({
	add: async (c) => {
		const form = await c.req.formData();
		await addTodo(c.env.DB, { title: String(form.get("title") ?? "") });
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

## Escaping

`html` escapes every interpolated value. Strings, numbers and nested templates are safe by default:

```ts
html`<p>${userComment}</p>`; // <script> in the comment is shown as text
```

- Arrays are joined, so `${items.map(...)}` works.
- `null`, `undefined` and `false` render nothing, so `${cond ? html`...` : null}` works.
- `raw(markup)` places markup unchanged. Use it only for markup you built yourself.

**Formatters rewrite the markup.** An `html` template is HTML to Prettier-style formatters, which reflow its whitespace and indentation. The browser ignores most of that, but whitespace inside `<pre>`, or between inline elements, can change what the user sees. Keep those spans out of templates the formatter touches, or put them in `raw()` strings.

## Limits

- The loader's data reaches the page unchecked at run time. `definePage` and `defineLoader` keep the two types in step inside a page's own files. Changing one without the other is not caught across files.
- Pages do not support environment suffixes such as `.dev`.
- No layouts yet. Share a head or a shell with a function that returns `html`.
- No client-side interactivity yet. Forms and redirects are the only interaction. Datastar's TypeScript SDK can be added later.

## Playground

`app/pages/board.page.ts` and `app/pages/board.server.ts` list the todos from D1 and add one through a form. Verified in `vite dev`: the page renders, a form post redirects back, an empty title gets 400, an unknown action gets 404, and a script in a title is shown as text.
