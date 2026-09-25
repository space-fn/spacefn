// --- Table Definition ---------------------------------------------------------
// defineTable() for schema definition

import type { ColumnBuilder } from "./column.js";
import type { TableDefinition } from "./types.js";

/**
 * Define a table schema.
 *
 * Column names come from the object keys, not string arguments.
 *
 * @example
 * ```ts
 * import { defineTable, column } from "@spacefn/db"
 *
 * export const users = defineTable("users", {
 *   id:        column.id(),
 *   email:     column.string().unique(),
 *   name:      column.string(),
 *   role:      column.enum("admin", "user").default("user"),
 *   createdAt: column.timestamps().create,
 *   updatedAt: column.timestamps().update,
 * })
 * ```
 */
export function defineTable(name: string, columns: Record<string, ColumnBuilder>): TableDefinition {
	const columnDefs: TableDefinition["columns"] = {};

	for (const [key, builder] of Object.entries(columns)) {
		columnDefs[key] = builder.toJSON();
	}

	return { name, columns: columnDefs };
}
