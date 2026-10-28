import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { SpaceError } from "../errors";
import { generateQueriesSource, type GeneratedQuery } from "./generate-queries";
import { inferQuery, scratchDatabase, type Dialect } from "./infer";
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
	dialect: Dialect = "sqlite",
): Promise<GeneratedQuery[]> {
	const files = await readdir(dir)
		.then((names) => names.filter((name) => name.endsWith(".sql") && !name.startsWith("_")).sort())
		.catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		});
	if (files.length === 0) return [];

	const scratch = await scratchDatabase(migrations, dialect);
	const seen = new Set<string>();
	const queries: GeneratedQuery[] = [];

	for (const file of files) {
		const parsed = parseQueryFile(file, await readFile(join(dir, file), "utf8"));
		if (seen.has(parsed.name))
			throw new SpaceError("QUERY_DUP", `Query name ${parsed.name} is used by two files`, {
				hint: "Rename one query.",
			});
		seen.add(parsed.name);

		const { sql, names } = namedParams(parsed.sql);
		const inferred = await inferQuery(scratch, { ...parsed, sql }, dialect);
		// validate the all-excluded variant too
		const excludedRaw = parsed.parts
			.filter((p) => p.gate === null)
			.map((p) => p.sql)
			.join("\\n");
		const { sql: excludedBound } = namedParams(excludedRaw);
		try {
			await scratch.prepare(excludedBound);
		} catch (e) {
			throw new SpaceError(
				"QUERY_INVALID",
				`${parsed.name}: base (all conditionals excluded) SQL is invalid: ${(e as Error).message}`,
				{ hint: "Check the SQL in the query file." },
			);
		}
		const parts = parsed.parts.map((p) => {
			const r = namedParams(p.sql);
			return { sql: r.sql, paramNames: r.names, gate: p.gate };
		});
		queries.push({
			...inferred,
			sql: parsed.sql,
			boundSql: sql,
			paramNames: names,
			paramTypes: parsed.params,
			parts,
		});
	}
	return queries;
}

/** Reads `db/queries/*.sql` and returns the source of `.space/queries.ts`. */
export async function buildQueries(
	dir: string,
	migrations: Migration[],
	dialect: Dialect = "sqlite",
): Promise<string> {
	return generateQueriesSource(await analyzeQueries(dir, migrations, dialect));
}
