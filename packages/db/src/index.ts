// --- @spacefn/db -------------------------------------------------------------
// SQLite-oriented database layer for Kysely

export {
	column,
	index,
	type ColumnDef,
	type ColumnChain,
	type IndexDef,
	type IndexOptions,
} from "./column.js";
export { defineSchema, type SchemaDef, type TableDef, type ColumnInput } from "./schema-types.js";
export { generateTypes } from "./generate-types.js";
export {
	generateMigration,
	generateIncrementalMigration,
	generateMigrationName,
} from "./migration-generator.js";
export { migrate, migrateDown, migrateStatus, type Migration } from "./migrate.js";
