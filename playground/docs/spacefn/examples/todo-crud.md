# Todo board

This example joins a D1 database, generated SQL functions, a todos module, page actions, and
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

Create the query files in `app/db/main_db/queries/`. Each file starts with its
`-- name:` line.

Create `app/db/main_db/queries/list-todos.sql`:

```sql
-- name: listTodos :many
SELECT id, title, done FROM todos ORDER BY id;
```

Create `app/db/main_db/queries/add-todo.sql`:

```sql
-- name: addTodo :exec
-- @param title string
INSERT INTO todos (title) VALUES (:title);
```

Create `app/db/main_db/queries/set-todo-done.sql`:

```sql
-- name: setTodoDone :exec
-- @param id number
-- @param done number
UPDATE todos SET done = :done WHERE id = :id;
```

Create `app/db/main_db/queries/delete-todo.sql`:

```sql
-- name: deleteTodo :exec
-- @param id number
DELETE FROM todos WHERE id = :id;
```

Declare the D1 binding as shown in the [database guide](../directory-structure/database.md#binding).

Add the connect helper beside the database folder. Every `app/` file that needs the database calls it:

```ts
// app/db/main_db.ts

import { migrated } from "@space/db/main_db";
import { d1Executor, type DbReader } from "spacefn/db";

export async function mainDb(binding: D1Database): Promise<DbReader> {
	await migrated(binding);
	return d1Executor(binding);
}
```

## The todos module

Everything the board decides lives in `modules/todos/`: what a valid title is, which values an action may send, and how the list renders. It receives the database as an argument and never sees a request.

```ts
// modules/todos/todos.ts

import { addTodo, deleteTodo, listTodos, setTodoDone } from "@space/db/main_db";
import { AppError } from "@utils/errors";
import type { DbReader } from "spacefn/db";

export const MAX_TITLE = 200;

export function todoTitle(input: unknown): string {
	const title = String(input ?? "").trim();
	if (!title) throw new AppError("invalid", "A todo needs a title.");
	if (title.length > MAX_TITLE) {
		throw new AppError("invalid", `Keep titles under ${MAX_TITLE} characters.`);
	}
	return title;
}

function todoId(input: unknown): number {
	const id = Number(input);
	if (!Number.isSafeInteger(id) || id < 1) throw new AppError("invalid", "Unknown todo.");
	return id;
}

export function allTodos(db: DbReader) {
	return listTodos(db, {});
}

export async function createTodo(db: DbReader, input: { title?: unknown }) {
	await addTodo(db, { title: todoTitle(input.title) });
	return allTodos(db);
}

export async function markTodo(db: DbReader, input: { id: unknown; done: unknown }) {
	const done = Number(input.done);
	if (done !== 0 && done !== 1) throw new AppError("invalid", "A todo is done or not done.");
	await setTodoDone(db, { id: todoId(input.id), done });
	return allTodos(db);
}

export async function removeTodo(db: DbReader, input: { id: unknown }) {
	await deleteTodo(db, { id: todoId(input.id) });
	return allTodos(db);
}
```

The list fragment is the module's too, because every action re-sends it. It takes the action paths as plain strings:

```ts
// modules/todos/views.ts

import type { ListTodosRow } from "@space/db/main_db";
import { html } from "spacefn/html";

export interface TodoPaths {
	toggle: string;
	remove: string;
}

export function todoList(todos: ListTodosRow[], paths: TodoPaths, error?: string) {
	return html`<div id="todos">
		${error ? html`<p role="alert">${error}</p>` : null}
		<ul>
			${todos.map(
				(todo) =>
					html`<li>
						<form data-on:submit__prevent="@post('${paths.toggle}', {contentType: 'form'})">
							<input type="hidden" name="id" value=${todo.id} />
							<input type="hidden" name="done" value=${todo.done === 1 ? 0 : 1} />
							<button type="submit">${todo.done === 1 ? "Undo" : "Complete"}: ${todo.title}</button>
						</form>
						<form data-on:submit__prevent="@post('${paths.remove}', {contentType: 'form'})">
							<input type="hidden" name="id" value=${todo.id} />
							<button type="submit">Delete</button>
						</form>
					</li>`,
			)}
		</ul>
	</div>`;
}
```

```ts
// modules/todos/index.ts

export { allTodos, createTodo, markTodo, MAX_TITLE, removeTodo, todoTitle } from "./todos";
export { todoList, type TodoPaths } from "./views";
```

## Loader and actions

`app/pages/todos.server.ts` is setup. Each action reads the form, calls the module, and sends back the list. An uncaught `AppError` would reach `app.onError` and answer with JSON; this page catches it instead and shows the message in the fragment, so the user sees why nothing changed:

```ts
// app/pages/todos.server.ts

import { mainDb } from "@app/db/main_db";
import { allTodos, createTodo, markTodo, removeTodo, todoList } from "@modules/todos";
import type { ListTodosRow } from "@space/db/main_db";
import { AppError } from "@utils/errors";
import type { DbReader } from "spacefn/db";
import { defineActions, defineLoader, type PageAction } from "spacefn/pages";

export const loader = defineLoader(async (c) => ({
	todos: await allTodos(await mainDb(c.env.DB)),
}));

type Change = (db: DbReader, form: FormData) => Promise<ListTodosRow[]>;

async function update(c: Parameters<PageAction>[0], change: Change): Promise<Response> {
	const db = await mainDb(c.env.DB);
	const paths = { toggle: actions.toggle.path(), remove: actions.remove.path() };
	try {
		return c.html(todoList(await change(db, await c.req.formData()), paths));
	} catch (error) {
		if (!(error instanceof AppError)) throw error;
		return c.html(todoList(await allTodos(db), paths, error.message));
	}
}

export const actions = defineActions({
	add: (c) => update(c, (db, form) => createTodo(db, { title: form.get("title") })),
	toggle: (c) =>
		update(c, (db, form) => markTodo(db, { id: form.get("id"), done: form.get("done") })),
	remove: (c) => update(c, (db, form) => removeTodo(db, { id: form.get("id") })),
});
```

## Page

`app/pages/todos.page.ts` is the shell around the fragment:

```ts
// app/pages/todos.page.ts

import { MAX_TITLE, todoList } from "@modules/todos";
import { definePage, html } from "spacefn/pages";

import { actions, type loader } from "./todos.server";

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
							<label>New todo <input name="title" required maxlength=${MAX_TITLE} /></label>
							<button>Add</button>
						</form>
						${todoList(props.todos, { toggle: actions.toggle.path(), remove: actions.remove.path() })}
					</main>
				</body>
			</html>`,
);
```

Each action returns only the `<div id="todos">` fragment, and Datastar morphs the matching element in place. `required` and `maxlength` help the user, but the module validates every value again: the browser's checks are not server-side validation. The page reads `MAX_TITLE` from the module, so the two limits cannot drift apart.

## Test the rules

The module runs without a Worker, so its rules are tested directly:

```ts
// modules/todos/todos.test.ts

import { AppError } from "@utils/errors";
import { expect, test } from "vite-plus/test";

import { MAX_TITLE, todoTitle } from "./todos";

test("trims a title", () => {
	expect(todoTitle("  Buy milk ")).toBe("Buy milk");
});

test("rejects empty and overlong titles", () => {
	expect(() => todoTitle(" ")).toThrow(AppError);
	expect(() => todoTitle("x".repeat(MAX_TITLE + 1))).toThrow(AppError);
});
```

See [modules](../directory-structure/modules.md), [database](../directory-structure/database.md),
[pages](../directory-structure/pages.md), and [Datastar](../guides/datastar.md).
