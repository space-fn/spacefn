import { html, type HtmlValue } from "spacefn";

import type { Todo } from "./todos.ts";

/** The list. Datastar swaps it in by its `id` when the todos change. */
export const todoList = (props: { readonly todos: readonly Todo[]; readonly toggle: string }) =>
	html`<ul id="${todoList.id}">
		${props.todos.map(
			(todo) =>
				html`<li>
					<form method="post" action="${props.toggle}">
						<input type="hidden" name="id" value="${todo.id}" />
						<button class="${todo.done ? "done" : ""}">${todo.title}</button>
					</form>
				</li>`,
		)}
	</ul>`;
todoList.id = "todos";

/** The page's body: a form to add a todo, then the list, kept current by `live`. */
export const todosPage = (props: {
	readonly greeting: string;
	readonly list: HtmlValue;
	/** Where the form posts. */
	readonly add: string;
	/** What Datastar opens for live updates. */
	readonly live: string;
	/** Whether the last todo sent had no title. */
	readonly untitled: boolean;
}) =>
	html`<main data-init="@get('${props.live}')">
		<h1>${props.greeting}</h1>
		<form method="post" action="${props.add}">
			<input name="title" placeholder="What needs doing?" autofocus />
			<button>Add</button>
		</form>
		${props.untitled ? html`<p role="alert">Give the todo a title.</p>` : ""} ${props.list}
	</main>`;
