# Todo board

This example joins a D1 database, generated SQL functions, page actions, and
Datastar. The page action returns the updated list as an HTML fragment, so the
browser does not need a client-side router or a separate JSON API.

## Database

Create `app/db/main_db/migrations/0001_create_todos.sql`:

```sql
-- up
CREATE TABLE todos (
	id INTEGER PRIMARY KEY,
	title TEXT NOT NULL,
	done INTEGER NOT NULL DEFAULT 0
);
```

Create the query files in `app/db/main_db/queries/`:

```sql
-- list-todos.sql
-- name: listTodos :many
SELECT id, title, done FROM todos ORDER BY id;
```

```sql
-- add-todo.sql
-- name: addTodo :exec
-- @param title string
INSERT INTO todos (title) VALUES (:title);
```

```sql
-- set-todo-done.sql
-- name: setTodoDone :exec
-- @param id number
-- @param done number
UPDATE todos SET done = :done WHERE id = :id;
```

```sql
-- delete-todo.sql
-- name: deleteTodo :exec
-- @param id number
DELETE FROM todos WHERE id = :id;
```

Declare the D1 binding as shown in the [database guide](../directory-structure/database.md#binding).

## Page

Share the list markup between the page and its actions with
`app/pages/_todos.ts`:

```ts
import { html } from "spacefn/pages";

type Todo = { id: number; title: string; done: number };

export function renderTodos(todos: Todo[], togglePath: string, removePath: string) {
	return html`<ul id="todos">
		${todos.map(
			(todo) =>
				html`<li>
					<form data-on:submit__prevent="@post('${togglePath}', {contentType: 'form'})">
						<input type="hidden" name="id" value=${todo.id} />
						<input type="hidden" name="done" value=${todo.done === 1 ? 0 : 1} />
						<button type="submit">${todo.done === 1 ? "Undo" : "Complete"}: ${todo.title}</button>
					</form>
					<form data-on:submit__prevent="@post('${removePath}', {contentType: 'form'})">
						<input type="hidden" name="id" value=${todo.id} />
						<button type="submit">Delete</button>
					</form>
				</li>`,
		)}
	</ul>`;
}
```

Create `app/pages/todos.page.ts`:

```ts
import { definePage, html } from "spacefn/pages";

import { renderTodos } from "./_todos";
import { actions, loader } from "./todos.server";

export default definePage<typeof loader>(
	(props) =>
		html`<!doctype html>
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<title>Todos</title>
					<script
						type="module"
						src="https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.4/bundles/datastar.js"
					></script>
				</head>
				<body>
					<main>
						<h1>Todos</h1>
						<form data-on:submit__prevent="@post('${actions.add.path()}', {contentType: 'form'})">
							<label>New todo <input name="title" required maxlength="200" /></label>
							<button>Add</button>
						</form>
						${renderTodos(props.todos, actions.toggle.path(), actions.remove.path())}
					</main>
				</body>
			</html>`,
);
```

## Loader and actions

Create `app/pages/todos.server.ts`:

```ts
import { addTodo, deleteTodo, listTodos, setTodoDone } from "@space/db/main_db";
import { migrated } from "@space/db/main_db";
import { d1Executor } from "spacefn/db";
import { defineActions, defineLoader } from "spacefn/pages";

import { renderTodos } from "./_todos";

async function currentTodos(db: D1Database) {
	await migrated(db);
	return listTodos(d1Executor(db), {});
}

export const loader = defineLoader(async (c) => ({
	todos: await currentTodos(c.env.DB),
}));

export const actions = defineActions({
	add: async (c) => {
		const form = await c.req.formData();
		const title = String(form.get("title") ?? "").trim();
		if (!title) return c.json({ error: "title_required" }, 400);
		await migrated(c.env.DB);
		await addTodo(d1Executor(c.env.DB), { title: title.slice(0, 200) });
		return c.html(
			renderTodos(await currentTodos(c.env.DB), actions.toggle.path(), actions.remove.path()),
		);
	},
	toggle: async (c) => {
		const form = await c.req.formData();
		const id = Number(form.get("id"));
		const done = Number(form.get("done"));
		if (!Number.isSafeInteger(id) || ![0, 1].includes(done)) {
			return c.json({ error: "invalid_todo" }, 400);
		}
		await migrated(c.env.DB);
		await setTodoDone(d1Executor(c.env.DB), { id, done });
		return c.html(
			renderTodos(await currentTodos(c.env.DB), actions.toggle.path(), actions.remove.path()),
		);
	},
	remove: async (c) => {
		const form = await c.req.formData();
		const id = Number(form.get("id"));
		if (!Number.isSafeInteger(id)) return c.json({ error: "invalid_todo" }, 400);
		await migrated(c.env.DB);
		await deleteTodo(d1Executor(c.env.DB), { id });
		return c.html(
			renderTodos(await currentTodos(c.env.DB), actions.toggle.path(), actions.remove.path()),
		);
	},
});
```

Each successful action returns only the `<ul id="todos">` fragment. Datastar
morphs the matching element in place. The server validates every submitted
value; `required`, `maxlength`, hidden fields, and checkboxes are not trusted
as server-side validation.

See [database](../directory-structure/database.md), [pages](../directory-structure/pages.md),
and [Datastar](../guides/datastar.md).
