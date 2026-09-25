// --- Space DB Vite Plugin -----------------------------------------------------
// Scans src/db/*/schema.ts, diffs against snapshot, generates migrations + types

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { Plugin } from "vite";

import type { DatabaseSchema, TableDefinition } from "../types.js";
import { diffSchemas, hasChanges } from "./differ.js";
import { generateTypesCode, generateMigrationFile, generateMigrationIndex } from "./generator.js";
import type { Dialect } from "./sql.js";

/** Plugin options */
export interface DbPluginOptions {
	/** Working directory (default: process.cwd()) */
	root?: string;
	/** SQL dialect (default: "postgres") */
	dialect?: Dialect;
}

/** Scanned database folder */
interface ScannedDatabase {
	/** Database name (folder name) */
	name: string;
	/** Absolute path to schema.ts */
	schemaFile: string;
	/** Absolute path to migrations directory */
	migrationsDir: string;
}

/** Scan src/db/ for database folders with schema.ts */
async function scanDatabases(root: string): Promise<ScannedDatabase[]> {
	const dbDir = join(root, "src", "db");
	const databases: ScannedDatabase[] = [];

	try {
		const items = await readdir(dbDir, { withFileTypes: true });
		for (const item of items) {
			if (!item.isDirectory()) continue;
			const dbPath = join(dbDir, item.name);
			const schemaFile = join(dbPath, "schema.ts");

			try {
				await readFile(schemaFile, "utf-8");
				databases.push({
					name: item.name,
					schemaFile,
					migrationsDir: join(dbPath, "migrations"),
				});
			} catch {
				// schema.ts doesn't exist, skip
			}
		}
	} catch {
		// src/db/ doesn't exist
	}

	return databases;
}

/** Snapshot file path */
function snapshotPath(root: string, dbName: string): string {
	return join(root, "src", "db", dbName, ".schema.json");
}

/** Load schema snapshot from disk */
async function loadSnapshot(root: string, dbName: string): Promise<DatabaseSchema> {
	try {
		const content = await readFile(snapshotPath(root, dbName), "utf-8");
		return JSON.parse(content);
	} catch {
		return {};
	}
}

/** Save schema snapshot to disk */
async function saveSnapshot(root: string, dbName: string, schema: DatabaseSchema): Promise<void> {
	const path = snapshotPath(root, dbName);
	await mkdir(join(root, "src", "db", dbName), { recursive: true });
	await writeFile(path, JSON.stringify(schema, null, 2) + "\n");
}

/** Process a single database: diff schema, generate migration + types */
async function processDatabase(root: string, db: ScannedDatabase, dialect: Dialect): Promise<void> {
	// Import the schema module
	let schemaModule: Record<string, unknown>;
	try {
		schemaModule = await import(/* @vite-ignore */ `file://${db.schemaFile}?t=${Date.now()}`);
	} catch (err) {
		console.error(`[db] Failed to import schema for "${db.name}":`, err);
		return;
	}

	// Extract table definitions
	const currentSchema: DatabaseSchema = {};
	for (const [key, value] of Object.entries(schemaModule)) {
		if (typeof value === "object" && value !== null && "name" in value && "columns" in value) {
			const table = value as TableDefinition;
			currentSchema[key] = table;
		}
	}

	if (Object.keys(currentSchema).length === 0) return;

	// Diff against snapshot
	const previousSchema = await loadSnapshot(root, db.name);
	const changes = diffSchemas(previousSchema, currentSchema);

	if (!hasChanges(changes)) return;

	// Generate migration file
	const { name, content } = generateMigrationFile(changes, dialect);

	// Write migration file
	await mkdir(db.migrationsDir, { recursive: true });
	const migrationFile = join(db.migrationsDir, `${name}.ts`);
	await writeFile(migrationFile, content);
	console.log(`[db:${db.name}] Generated migration: ${name}.ts`);

	// Generate types.ts
	const typesCode = generateTypesCode(currentSchema);
	const typesFile = join(root, "src", "db", db.name, "types.ts");
	await writeFile(typesFile, typesCode);
	console.log(`[db:${db.name}] Generated types.ts`);

	// Generate migrations/index.ts barrel
	const migrationFiles = await readdir(db.migrationsDir);
	const tsFiles = migrationFiles
		.filter((f) => f.endsWith(".ts") && f !== "index.ts")
		.sort()
		.map((f) => join(db.migrationsDir, f));
	const indexCode = generateMigrationIndex(tsFiles, dialect);
	const indexFile = join(db.migrationsDir, "index.ts");
	await writeFile(indexFile, indexCode);
	console.log(`[db:${db.name}] Generated migrations/index.ts`);

	// Save snapshot
	await saveSnapshot(root, db.name, currentSchema);
}

/** Create the @spacefn/db Vite plugin */
export async function db(options: DbPluginOptions = {}): Promise<Plugin> {
	const root = options.root ?? process.cwd();
	const dialect = options.dialect ?? "postgres";
	const databases = await scanDatabases(root);

	if (databases.length > 0) {
		console.log(
			`[db] Found ${databases.length} database(s): ${databases.map((d) => d.name).join(", ")}`,
		);
	}

	return {
		name: "@spacefn/db",

		async buildStart() {
			// Process all databases on build start
			for (const db_ of databases) {
				await processDatabase(root, db_, dialect);
			}
		},

		async handleHotUpdate({ file, server }) {
			// Re-process when a schema file changes
			for (const db_ of databases) {
				if (file === db_.schemaFile) {
					await processDatabase(root, db_, dialect);
					// Trigger full reload to pick up generated types
					server.ws.send({ type: "full-reload" });
					return [];
				}
			}
		},
	};
}
