import { Effect, Schema } from "effect";
import { action, Bus, Datastar, html, page, redirect } from "spacefn";

import Env from "#configs/env.ts";
import MainDb from "#space/db/main.ts";

import { layout } from "./_layout.ts";

/** The Bus topic every change to the todos is announced on. */
const TOPIC = "todos";

const todoList = Effect.gen(function* () {
	const todos = yield* (yield* MainDb).listTodos();
	return html`<ul id="todos">
		${todos.map(
			(todo) =>
				html`<li>
					<form method="post" action="?__action=toggle">
						<input type="hidden" name="id" value="${todo.id}" />
						<button class="${todo.done ? "done" : ""}">${todo.title}</button>
					</form>
				</li>`,
		)}
	</ul>`;
});

/** After a change: tell every open page, then send this browser back to the list. */
const changed = Effect.gen(function* () {
	yield* (yield* Bus).publish(TOPIC, "changed");
	return redirect("/");
});

export default page({
	loader: Effect.gen(function* () {
		return { greeting: (yield* Env).GREETING, list: yield* todoList };
	}),
	actions: {
		add: action({
			input: Schema.Struct({ title: Schema.NonEmptyString }),
			handler: ({ title }) =>
				Effect.gen(function* () {
					yield* (yield* MainDb).addTodo({ title });
					return yield* changed;
				}),
		}),
		toggle: action({
			input: Schema.Struct({ id: Schema.FiniteFromString }),
			handler: ({ id }) =>
				Effect.gen(function* () {
					yield* (yield* MainDb).toggleTodo({ id });
					return yield* changed;
				}),
		}),
		// Datastar opens this when the page loads, and gets the list again after each change.
		live: action({
			method: "get",
			input: Schema.Struct({}),
			handler: () => Datastar.watch([TOPIC], todoList),
		}),
	},
	render: (ctx) =>
		layout(
			"Todos",
			html`<main data-init="@get('${ctx.actions.live.url}')">
				<h1>${ctx.loaderData.greeting}</h1>
				<form method="post" action="${ctx.actions.add.url}">
					<input name="title" placeholder="What needs doing?" autofocus />
					<button>Add</button>
				</form>
				${ctx.action?.name === "add" && !ctx.action.ok ? html`<p role="alert">Give the todo a title.</p>` : ""}
				${ctx.loaderData.list}
			</main>`,
		),
});
