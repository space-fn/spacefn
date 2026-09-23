// --- Migration Generator ------------------------------------------------------
// Manages schema snapshots and generates migration files

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";

import type { DatabaseSchema } from "../types.js";
import { diffSchemas, hasChanges, type SchemaChange } from "./differ.js";
import {
	generateCreateTable,
	generateDropTable,
	generateAddColumn,
	generateDropColumn,
	generateAlterColumnType,
	generateAlterColumnNullability,
	generateAlterColumnDefault,
} from "./sql.js";

// --- Snapshot Management ------------------------------------------------------

/** Snapshot file path for a database */
function snapshotPath(root: string, dbName: string): string {
	return join(root, "src", "db", dbName, ".schema.json");
}

/** Load schema snapshot from disk */
export async function loadSnapshot(root: string, dbName: string): Promise<DatabaseSchema> {
	try {
		const content = await readFile(snapshotPath(root, dbName), "utf-8");
		return JSON.parse(content) as DatabaseSchema;
	} catch {
		return {};
	}
}

/** Save schema snapshot to disk */
export async function saveSnapshot(
	root: string,
	dbName: string,
	schema: DatabaseSchema,
): Promise<void> {
	const path = snapshotPath(root, dbName);
	await writeFile(path, JSON.stringify(schema, null, "\t") + "\n", "utf-8");
}

// --- Migration File Generation ------------------------------------------------

/** Generate a descriptive slug from schema changes */
function migrationSlug(changes: SchemaChange[]): string {
	if (changes.length === 0) return "empty";

	const first = changes[0];
	if (changes.length === 1) {
		switch (first.type) {
			case "table_added":
				return `create_${first.table}`;
			case "table_dropped":
				return `drop_${first.table}`;
			case "column_added":
				return `add_${first.column.name}_to_${first.table}`;
			case "column_dropped":
				return `drop_${first.column}_from_${first.table}`;
			case "column_changed":
				return `alter_${first.column}_in_${first.table}`;
		}
	}

	return `update_${first.table}`;
}

/** Generate timestamp prefix (YYYYMMDDHHMMSS) */
function timestamp(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return (
		`${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
		`${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
	);
}

/** Generate migration file content */
function generateMigrationFile(name: string, upSql: string[], downSql: string[]): string {
	const lines: string[] = [
		'import { defineMigration } from "@spacefn/db";',
		"",
		"export const migration = defineMigration({",
		`\tname: ${JSON.stringify(name)},`,
		"\tup: async (sql) => {",
		...upSql.map((s) => `\t\tawait sql.exec(${JSON.stringify(s)});`),
		"\t},",
		"\tdown: async (sql) => {",
		...downSql.map((s) => `\t\tawait sql.exec(${JSON.stringify(s)});`),
		"\t},",
		"});",
		"",
	];

	return lines.join("\n");
}

/** Generate SQL statements from schema changes */
function changesToSql(changes: SchemaChange[]): { up: string[]; down: string[] } {
	const up: string[] = [];
	const down: string[] = [];

	for (const change of changes) {
		switch (change.type) {
			case "table_added":
				up.push(generateCreateTable(change.table, change.definition.columns));
				down.push(generateDropTable(change.table));
				break;

			case "table_dropped":
				// We can't reverse a DROP without knowing the schema
				// The user should have the snapshot if they need to rollback
				up.push(generateDropTable(change.table));
				break;

			case "column_added":
				up.push(generateAddColumn(change.table, change.column));
				down.push(generateDropColumn(change.table, change.column.name));
				break;

			case "column_dropped":
				up.push(generateDropColumn(change.table, change.column));
				// Can't reverse DROP without knowing the full column definition
				break;

			case "column_changed": {
				const { before, after } = change;

				// Type changed
				if (
					before.dataType !== after.dataType ||
					JSON.stringify(before.typeArgs) !== JSON.stringify(after.typeArgs)
				) {
					up.push(generateAlterColumnType(change.table, after));
					down.push(generateAlterColumnType(change.table, before));
				}

				// Nullability changed
				if (before.nullable !== after.nullable) {
					up.push(generateAlterColumnNullability(change.table, after));
					down.push(generateAlterColumnNullability(change.table, before));
				}

				// Default changed
				if (before.default !== after.default) {
					up.push(generateAlterColumnDefault(change.table, after));
					down.push(generateAlterColumnDefault(change.table, before));
				}
				break;
			}
		}
	}

	return { up, down };
}

// --- Main Entry Point ---------------------------------------------------------

/** Process schema changes: generate migration file if needed, update snapshot */
export async function processMigration(
	root: string,
	dbName: string,
	currentSchema: DatabaseSchema,
): Promise<{ generated: string | null }> {
	const previous = await loadSnapshot(root, dbName);
	const changes = diffSchemas(previous, currentSchema);

	if (!hasChanges(changes)) {
		return { generated: null };
	}

	// Generate SQL
	const { up, down } = changesToSql(changes);
	if (up.length === 0) return { generated: null };

	// Generate migration file
	const name = `${timestamp()}_${migrationSlug(changes)}`;
	const content = generateMigrationFile(name, up, down);

	// Write migration file
	const migrationsDir = join(root, "src", "db", dbName, "migrations");
	await mkdir(migrationsDir, { recursive: true });
	const filePath = join(migrationsDir, `${name}.ts`);
	await writeFile(filePath, content, "utf-8");

	// Update snapshot
	await saveSnapshot(root, dbName, currentSchema);

	return { generated: basename(filePath) };
}
