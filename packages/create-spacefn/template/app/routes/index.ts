import { Effect, Schema } from "effect";
import { action, actionUrl, Datastar, page, redirect } from "spacefn";

import { layout } from "#lib/ui/layout.ts";
import * as Todos from "#modules/todos/todos.ts";
import { todoList, todosPage } from "#modules/todos/views.ts";

// The page at /. It only connects the todos module to the web: the logic and the markup are there.

const list = Todos.list.pipe(
	Effect.map((todos) => todoList({ todos, toggle: actionUrl("toggle") })),
);

export default page({
	loader: Effect.all({ greeting: Todos.greeting, list }),
	actions: {
		// After a form post, send the browser back to the list.
		add: action({
			input: Todos.NewTodo,
			handler: (todo) => Effect.as(Todos.add(todo), redirect("/")),
		}),
		toggle: action({
			input: Todos.TodoRef,
			handler: (todo) => Effect.as(Todos.toggle(todo), redirect("/")),
		}),
		// Datastar opens this when the page loads, and gets the list again after each change.
		live: action({
			method: "get",
			input: Schema.Struct({}),
			handler: () => Datastar.watch([Todos.TOPIC], list),
		}),
	},
	render: (ctx) =>
		layout(
			"Todos",
			todosPage({
				greeting: ctx.data.greeting,
				list: ctx.data.list,
				add: ctx.actions.add.url,
				live: ctx.actions.live.url,
				untitled: ctx.actions.add.ok === false,
			}),
		),
});
