// --- @spacefn/db -------------------------------------------------------------
// Convention-based database layer for Kysely

export { defineTable } from "./table.js";
export { column, ColumnBuilder } from "./column.js";
export { createMigrator, createMigrationProvider } from "./migrator.js";
export type {
	ColumnDataType,
	ColumnDefinition,
	TableDefinition,
	DatabaseSchema,
	InferColumnType,
	InferRowType,
	InferInsertType,
	InferDatabaseType,
} from "./types.js";
