// --- @spacefn/db -------------------------------------------------------------
// Convention-based database layer for Kysely

export { defineTable } from "./table.js";
export { createMigrator, defineMigration } from "./migrator.js";
export { column } from "./column.js";
export { ColumnBuilder } from "./column.js";
export type {
	ColumnDefinition,
	TableDefinition,
	DatabaseSchema,
	ColumnDataType,
	InferColumnType,
	InferRowType,
	InferDatabaseType,
} from "./types.js";
export type { MigrationDefinition, MigratorConfig } from "./migrator.js";
