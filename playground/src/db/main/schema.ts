import { defineTable, column } from "@spacefn/db"

// --- Categories ---
export const categories = defineTable("categories", {
	id: column.id(),
	name: column.string().unique(),
	color: column.string(7).default("'#6b7280'"),
	createdAt: column.timestamps().create,
})

// --- Todos ---
export const todos = defineTable("todos", {
	id: column.id(),
	title: column.string(),
	description: column.text().nullable(),
	completed: column.boolean().default("false"),
	categoryId: column.integer().references("categories", "id").nullable(),
	priority: column.enum("low", "medium", "high").default("'medium'"),
	dueDate: column.timestamp().nullable(),
	createdAt: column.timestamps().create,
	updatedAt: column.timestamps().update,
})
