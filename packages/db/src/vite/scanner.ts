// --- Database Scanner ---------------------------------------------------------
// Scans src/db/*/ for config.ts and schema.ts files

import { readdir, access } from "node:fs/promises";
import { join, relative } from "node:path";

/** Scanned database */
export interface ScannedDatabase {
	/** Database name (folder name) */
	name: string;
	/** Relative path from src/db/ */
	path: string;
	/** Absolute path to config.ts */
	configFile: string;
	/** Absolute path to schema.ts */
	schemaFile: string;
}

/** Scan src/db/ for database folders */
export async function scanDatabases(root: string): Promise<ScannedDatabase[]> {
	const dbDir = join(root, "src", "db");
	const databases: ScannedDatabase[] = [];

	try {
		const items = await readdir(dbDir, { withFileTypes: true });
		for (const item of items) {
			if (!item.isDirectory()) continue;

			const dbPath = join(dbDir, item.name);
			const configFile = join(dbPath, "config.ts");
			const schemaFile = join(dbPath, "schema.ts");

			// Check if both files exist
			const [hasConfig, hasSchema] = await Promise.all([
				checkFileExists(configFile),
				checkFileExists(schemaFile),
			]);

			if (hasConfig && hasSchema) {
				databases.push({
					name: item.name,
					path: relative(root, dbPath),
					configFile,
					schemaFile,
				});
			}
		}
	} catch {
		// src/db/ doesn't exist
	}

	return databases;
}

/** Check if a file exists */
async function checkFileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}
