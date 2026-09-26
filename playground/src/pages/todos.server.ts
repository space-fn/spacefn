import { defineLoader } from "@spacefn/server";

import { getDb } from "../db/main/client";

export interface TodoItem {
	id: number;
	title: string;
	description: string | null;
	completed: boolean;
	priority: "low" | "medium" | "high";
	dueDate: string | null;
	categoryId: number | null;
	categoryName: string | null;
	categoryColor: string | null;
	createdAt: string;
}

export interface Category {
	id: number;
	name: string;
	color: string;
}

export const loader = defineLoader(async () => {
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

	const categories = await db
		.selectFrom("categories")
		.select(["id", "name", "color"])
		.orderBy("name")
		.execute();

	return { todos: todos as TodoItem[], categories: categories as Category[] };
});
