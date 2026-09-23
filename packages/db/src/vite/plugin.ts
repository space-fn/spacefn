// --- Space DB Vite Plugin -----------------------------------------------------
// Convention-based database type generation
// Composes @spacefn/vite-plugin for code generation and Vite lifecycle

import { space as baseSpace } from "@spacefn/vite-plugin";
import type { Generator } from "@spacefn/vite-plugin";
import type { Plugin } from "vite";

import type { TableDefinition, DatabaseSchema } from "../types.js";
import { generateTypesCode, generateMigrationIndex } from "./generator.js";
import { processMigration } from "./migrate.js";
import { scanDatabases } from "./scanner.js";

/** Plugin options */
export interface DbPluginOptions {
	/** Working directory (default: process.cwd()) */
	root?: string;
}

/** Create a generator for a database schema + migration */
function createDbGenerator(root: string, dbName: string, schemaFile: string): Generator {
	return {
		watch: `src/db/${dbName}/schema.ts`,
		output: `src/db/${dbName}/types.ts`,
		async generate() {
			// Dynamic import to get the schema at build time
			// Justified: module path is runtime-selected based on which db folder we're scanning
			const schemaModule = await import(/* @vite-ignore */ `file://${schemaFile}`);
			const tables: Record<string, TableDefinition> = {};
			const schema: DatabaseSchema = {};

			// Extract table definitions from exports
			for (const [key, value] of Object.entries(schemaModule)) {
				if (typeof value === "object" && value !== null && "name" in value && "columns" in value) {
					const table = value as TableDefinition;
					tables[key] = table;
					schema[key] = table;
				}
			}

			// Generate migration if schema changed
			if (Object.keys(schema).length > 0) {
				const result = await processMigration(root, dbName, schema);
				if (result.generated) {
					console.log(`[db] Generated migration: ${result.generated}`);
				}
			}

			if (Object.keys(tables).length === 0) return "";
			return generateTypesCode(tables);
		},
	};
}

/** Create a migration index generator for a database */
function createMigrationGenerator(dbName: string): Generator {
	return {
		watch: `src/db/${dbName}/migrations/*.ts`,
		output: `src/db/${dbName}/migrations/index.ts`,
		generate(files: string[]) {
			// Filter out index.ts itself
			const migrations = files.filter((f) => !f.endsWith("/index.ts") && !f.endsWith("/index.js"));
			if (migrations.length === 0) return "";
			return generateMigrationIndex(migrations);
		},
	};
}

/** Plugin factory — uses @spacefn/vite-plugin */
export async function db(options: DbPluginOptions = {}): Promise<Plugin> {
	const root = options.root ?? process.cwd();
	const databases = await scanDatabases(root);

	const generators = databases.flatMap((d) => [
		createDbGenerator(root, d.name, d.schemaFile),
		createMigrationGenerator(d.name),
	]);

	if (databases.length > 0) {
		console.log(
			`[db] Found ${databases.length} database(s): ${databases.map((d) => d.name).join(", ")}`,
		);
	}

	return baseSpace({ root, generators });
}
