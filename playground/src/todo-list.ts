// --- Todo List Component -----------------------------------------------------
// Shared renderer for the todo list — used by page and API routes

import { h } from "@spacefn/html"
import type { HtmlElement } from "@spacefn/html"

import {
	todoItemSx,
	badgeSx,
	btnSx,
	categoryColors,
} from "./styles"
import type { TodoItem } from "./pages/todos.server"

const priorityBadge: Record<string, string> = {
	low: "gray",
	medium: "warning",
	high: "danger",
}

/** Render a single todo item */
function todoItem(todo: TodoItem): HtmlElement {
	const titleClass = todo.completed
		? `${todoItemSx.title} ${todoItemSx.titleCompleted}`
		: todoItemSx.title

	const badgeColor = todo.categoryColor
		? (categoryColors[todo.categoryColor] ?? "gray")
		: "gray"

	return h.div(
		{ class: todoItemSx.base, "data-todo-id": String(todo.id) },

		// Checkbox
		h.input({
			type: "checkbox",
			class: todoItemSx.checkbox,
			checked: todo.completed || undefined,
			...h.div({}, "").attrs, // dummy — we'll use data-on-click below
		}),
		// Use a separate div with data-on for the toggle
		h.div(
			{ class: todoItemSx.content },

			h.div(
				{},
				h.p({ class: titleClass }, todo.title),
				todo.description
					? h.p({ class: todoItemSx.description }, todo.description)
					: null,
			),
			h.div(
				{ style: "display:flex;gap:0.25rem;flex-wrap:wrap;margin-top:0.25rem" },
				h.span(
					{
						class: badgeSx({ color: priorityBadge[todo.priority] }).base,
					},
					todo.priority,
				),
				todo.categoryName
					? h.span(
							{ class: badgeSx({ color: badgeColor }).base },
							todo.categoryName,
						)
					: null,
			),
		),

		// Actions
		h.div(
			{ class: todoItemSx.actions },
			h.button(
				{
					class: btnSx({ color: "ghost", size: "sm" }).base,
					"data-on-click": `@post('/api/todos/toggle', {signals:['id']})`,
					"data-signals-id": String(todo.id),
				},
				todo.completed ? "↩" : "✓",
			),
			h.button(
				{
					class: btnSx({ color: "ghost", size: "sm" }).base,
					"data-on-click": `@post('/api/todos/delete', {signals:['id']})`,
					"data-signals-id": String(todo.id),
				},
				"✕",
			),
		),
	)
}

/** Render the full todo list */
export function renderTodoList(todos: TodoItem[]): HtmlElement {
	if (todos.length === 0) {
		return h.div(
			{ class: "todo-list" },
			h.div(
				{},
				h.div({ style: "text-align:center;padding:3rem 0;color:#d1d5db" },
					h.div({ style: "font-size:3rem;margin-bottom:1rem" }, "📝"),
					h.p({ style: "font-size:1.25rem;font-weight:500" }, "No todos yet"),
					h.p({ style: "font-size:0.875rem;margin-top:0.25rem" }, "Create one above to get started"),
				),
			),
		)
	}

	return h.div(
		{ class: "todo-list" },
		...todos.map((todo) => todoItem(todo)),
	)
}
