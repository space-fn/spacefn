import { DatabaseSync } from "node:sqlite";

import type { ScratchDb, TableColumn } from "../infer";
import type { Migration } from "../migration-file";
import { splitStatements } from "../split";

/** An in-memory SQLite database with `migrations` applied, for checking queries. */
export async function scratchDatabase(migrations: readonly Migration[]): Promise<ScratchDb> {
	const db = new DatabaseSync(":memory:");
	for (const migration of migrations) {
		for (const statement of splitStatements(migration.sql)) db.exec(statement);
	}
	return {
		async prepare(sql) {
			const statement = db.prepare(sql);
			return {
				async columns() {
					return statement.columns().map((m) => ({
						name: m.name,
						table: m.table ?? null,
						column: m.column ?? null,
						type: m.type ?? null,
					}));
				},
			};
		},
		async tableInfo(table) {
			return db
				.prepare(`PRAGMA table_info("${table.replaceAll('"', '""')}")`)
				.all() as unknown as TableColumn[];
		},
		async tables() {
			const rows = db
				.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
				.all() as { name: string }[];
			return rows.map((r) => r.name);
		},
	};
}
