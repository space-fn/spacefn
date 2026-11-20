import { SqlError } from "./error.ts";

export interface Migration {
	/** File name without extension, e.g. `0001_create_todos`. */
	id: string;
	/** The "up" SQL. */
	sql: string;
	/** The "down" SQL (optional). */
	down?: string;
}

const FILE = /^(\d+)_([A-Za-z0-9_-]+)\.sql$/;

/**
 * Picks the migration files out of a folder listing and orders them by number.
 * Ignores non-`.sql` files and drafts starting with `_`. Two files with the same
 * number are an error, so a bad merge cannot silently pick one of them.
 */
export function orderMigrationFiles(names: readonly string[]): string[] {
	const files = names
		.filter((name) => name.endsWith(".sql") && !name.startsWith("_"))
		.map((name) => {
			const match = FILE.exec(name);
			if (!match)
				throw new SqlError(
					"MIGRATION_NAME",
					`Migration ${name} must be named NNNN_name.sql (e.g. 0001_create_todos.sql)`,
					{ file: name, hint: "Rename the file to NNNN_snake_case.sql." },
				);
			return { name, number: Number(match[1]) };
		})
		.sort((a, b) => a.number - b.number);

	for (let i = 1; i < files.length; i++) {
		const previous = files[i - 1]!;
		const current = files[i]!;
		if (previous.number === current.number) {
			throw new SqlError(
				"MIGRATION_DUP_NUMBER",
				`Migrations ${previous.name} and ${current.name} share the number ${current.number}`,
				{ file: current.name, hint: "Renumber one of them." },
			);
		}
	}
	return files.map((f) => f.name);
}

/** Parses one `NNNN_name.sql` file into its `-- up` and optional `-- down` sections. */
export function parseMigrationFile(name: string, raw: string): Migration {
	const up: string[] = [];
	const down: string[] = [];
	let section: "up" | "down" | null = null;
	for (const line of raw.split(/\r?\n/)) {
		const marker = line.trim().toLowerCase();
		if (marker === "-- up") {
			section = "up";
			continue;
		}
		if (marker === "-- down") {
			section = "down";
			continue;
		}
		if (section === "up") up.push(line);
		else if (section === "down") down.push(line);
	}
	const sql = up.join("\n").trim();
	if (!sql)
		throw new SqlError("MIGRATION_NO_UP", `Migration ${name} is missing a "-- up" section.`, {
			file: name,
			hint: "Add a `-- up` line before the SQL.",
		});
	const downSql = down.join("\n").trim();
	return { id: name.replace(/\.sql$/, ""), sql, ...(downSql ? { down: downSql } : {}) };
}
