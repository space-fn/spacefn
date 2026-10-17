// --- API Helpers -------------------------------------------------------------
// Shared functions for API routes: fetch todos, render list, return SSE

import { datastarSSE } from "@spacefn/datastar/server";
import { render } from "@spacefn/html";

import { getDb } from "./db/main/client";
import type { TodoItem, Category } from "./pages/todos.server";
import { renderTodoList } from "./todo-list";

/** Fetch all todos with category info */
export async function fetchTodos(): Promise<TodoItem[]> {
	const db = getDb();
	const todos = await db
		.selectFrom("todos")
		.leftJoin("categories", "categories.id", "todos.categoryId")
		.select([
			"todos.id",
			"todos.title",
			"todos.description",
			"todos.completed",
			"todos.priority",
			"todos.dueDate",
			"todos.categoryId",
			"categories.name as categoryName",
			"categories.color as categoryColor",
			"todos.createdAt",
		])
		.orderBy("todos.createdAt", "desc")
		.execute();
	return todos as TodoItem[];
}

/** Fetch all categories */
export async function fetchCategories(): Promise<Category[]> {
	const db = getDb();
	return db
		.selectFrom("categories")
		.select(["id", "name", "color"])
		.orderBy("name")
		.execute() as Promise<Category[]>;
}

/** Render the todo list HTML string */
export function renderTodoListHTML(todos: TodoItem[]): string {
	return render(renderTodoList(todos));
}

/** Create an SSE response that patches the todo list */
export function todoListSSE(todos: TodoItem[]) {
	const sse = datastarSSE();
	sse.patchElements(renderTodoListHTML(todos), { select: "#todo-list" });
	return sse.toResponse();
}
