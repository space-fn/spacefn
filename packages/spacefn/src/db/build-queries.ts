import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { generateQueriesSource, type GeneratedQuery } from "./generate-queries";
import { inferQuery, scratchDatabase } from "./infer";
import type { Migration } from "./migrate";
import { namedParams } from "./params";
import { parseQueryFile } from "./query-file";

/**
 * Reads and checks every `*.sql` query in `dir` against the migrated schema.
 * Any mismatch throws, so a bad query stops the build.
 */
export async function analyzeQueries(
	dir: string,
	migrations: Migration[],
): Promise<GeneratedQuery[]> {
	const files = await readdir(dir)
		.then((names) => names.filter((name) => name.endsWith(".sql") && !name.startsWith("_")).sort())
		.catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		});
	if (files.length === 0) return [];

	const scratch = scratchDatabase(migrations);
	const seen = new Set<string>();
	const queries: GeneratedQuery[] = [];

	for (const file of files) {
		const parsed = parseQueryFile(file, await readFile(join(dir, file), "utf8"));
		if (seen.has(parsed.name)) throw new Error(`Query name ${parsed.name} is used by two files`);
		seen.add(parsed.name);

		const { sql, names } = namedParams(parsed.sql);
		const inferred = inferQuery(scratch, { ...parsed, sql });
		queries.push({
			...inferred,
			sql: parsed.sql,
			boundSql: sql,
			paramNames: names,
			paramTypes: parsed.params,
		});
	}
	return queries;
}

/** Reads `db/queries/*.sql` and returns the source of `.space/queries.ts`. */
export async function buildQueries(dir: string, migrations: Migration[]): Promise<string> {
	return generateQueriesSource(await analyzeQueries(dir, migrations));
}
