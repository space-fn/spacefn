import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { SqlError } from "../error.ts";
import { analyzeQuery, type AnalyzedQuery } from "../infer.ts";
import { orderMigrationFiles, parseMigrationFile, type Migration } from "../migration-file.ts";
import { scratchDatabase } from "./scratch.ts";

const listOrEmpty = (dir: string) =>
	readdir(dir).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return [] as string[];
		throw error;
	});

/** Reads `<db>/migrations/NNNN_name.sql`, ordered by number. A missing folder means no migrations. */
export async function scanMigrations(dir: string): Promise<Migration[]> {
	const names = orderMigrationFiles(await listOrEmpty(dir));
	return Promise.all(
		names.map(async (name) => parseMigrationFile(name, await readFile(join(dir, name), "utf8"))),
	);
}

/**
 * Reads and checks every `*.sql` query in `dir` against the migrated schema.
 * Any mismatch throws, so a bad query stops the build.
 */
export async function scanQueries(
	dir: string,
	migrations: readonly Migration[],
): Promise<AnalyzedQuery[]> {
	const files = (await listOrEmpty(dir))
		.filter((name) => name.endsWith(".sql") && !name.startsWith("_"))
		.sort();
	if (files.length === 0) return [];

	const scratch = await scratchDatabase(migrations);
	const seen = new Set<string>();
	const queries: AnalyzedQuery[] = [];
	for (const file of files) {
		const query = await analyzeQuery(scratch, file, await readFile(join(dir, file), "utf8"));
		if (seen.has(query.name))
			throw new SqlError("QUERY_DUP", `Query name ${query.name} is used by two files`, {
				file,
				hint: "Rename one query.",
			});
		seen.add(query.name);
		queries.push(query);
	}
	return queries;
}
