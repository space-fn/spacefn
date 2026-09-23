// --- Space DB Vite Plugin -----------------------------------------------------
// Convention-based database type generation
// Composes @spacefn/vite-plugin for code generation and Vite lifecycle

import { space as baseSpace } from "@spacefn/vite-plugin";
import type { Generator } from "@spacefn/vite-plugin";
import type { Plugin } from "vite";

import type { TableDefinition } from "../types.js";
import { generateTypesCode } from "./generator.js";
import { scanDatabases } from "./scanner.js";

/** Plugin options */
export interface DbPluginOptions {
	/** Working directory (default: process.cwd()) */
	root?: string;
}

/** Create a generator for a database schema */
function createDbGenerator(dbName: string, schemaFile: string): Generator {
	return {
		watch: `src/db/${dbName}/schema.ts`,
		output: `src/db/${dbName}/types.ts`,
		async generate() {
			// Dynamic import to get the schema at build time
			// Justified: module path is runtime-selected based on which db folder we're scanning
			const schemaModule = await import(/* @vite-ignore */ `file://${schemaFile}`);
			const tables: Record<string, TableDefinition> = {};

			// Extract table definitions from exports
			for (const [key, value] of Object.entries(schemaModule)) {
				if (typeof value === "object" && value !== null && "name" in value && "columns" in value) {
					tables[key] = value as TableDefinition;
				}
			}

			if (Object.keys(tables).length === 0) return "";
			return generateTypesCode(tables);
		},
	};
}

/** Plugin factory — uses @spacefn/vite-plugin */
export async function db(options: DbPluginOptions = {}): Promise<Plugin> {
	const root = options.root ?? process.cwd();
	const databases = await scanDatabases(root);

	const generators = databases.map((d) => createDbGenerator(d.name, d.schemaFile));

	if (databases.length > 0) {
		console.log(
			`[db] Found ${databases.length} database(s): ${databases.map((d) => d.name).join(", ")}`,
		);
	}

	return baseSpace({ root, generators });
}
