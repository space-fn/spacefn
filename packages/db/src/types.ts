// --- Database Types -----------------------------------------------------------
// Core types for schema definition and Kysely compatibility

/** Column data types */
export type ColumnDataType =
	| "serial"
	| "integer"
	| "text"
	| "varchar"
	| "boolean"
	| "timestamp"
	| "json"
	| "enum";

/** Column definition — serializable snapshot of a column */
export interface ColumnDefinition {
	/** Column data type */
	dataType: ColumnDataType;
	/** VARCHAR length (only for varchar) */
	length?: number;
	/** Whether column is nullable */
	nullable: boolean;
	/** Whether column has unique constraint */
	unique: boolean;
	/** Default value (string literal or SQL expression) */
	default?: string;
	/** Foreign key reference */
	references?: [table: string, column: string];
	/** Enum values (only for enum type) */
	enumValues?: string[];
}

/** Table definition */
export interface TableDefinition {
	/** Table name */
	name: string;
	/** Column definitions keyed by property name */
	columns: Record<string, ColumnDefinition>;
}

/** Database schema (map of table definitions) */
export type DatabaseSchema = Record<string, TableDefinition>;

// --- Type Inference ----------------------------------------------------------

/** Map a ColumnDefinition to its TypeScript row type */
export type InferColumnType<T extends ColumnDefinition> = T["dataType"] extends "serial" | "integer"
	? number
	: T["dataType"] extends "boolean"
		? boolean
		: T["dataType"] extends "timestamp"
			? Date
			: T["dataType"] extends "enum"
				? T["enumValues"] extends readonly (infer V)[]
					? V extends string
						? V
						: string
					: string
				: string;

/** Infer row type (SELECT result) from a table definition */
export type InferRowType<T extends TableDefinition> = {
	[K in keyof T["columns"]]: InferColumnType<T["columns"][K]>;
};

/** Infer insert type from a table definition.
 *  Columns with defaults or auto-generation are optional. */
export type InferInsertType<T extends TableDefinition> = {
	[K in keyof T["columns"]]: T["columns"][K]["default"] extends string
		? InferColumnType<T["columns"][K]> | undefined
		: T["columns"][K]["nullable"] extends true
			? InferColumnType<T["columns"][K]> | null | undefined
			: InferColumnType<T["columns"][K]>;
};

/** Infer full database type from a schema */
export type InferDatabaseType<T extends DatabaseSchema> = {
	[K in keyof T]: InferRowType<T[K]>;
};
