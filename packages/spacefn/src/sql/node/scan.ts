import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { SqlError } from "../error.ts";
import { analyzeQuery, type AnalyzedQuery } from "../infer.ts";
import { orderMigrationFiles, parseMigrationFile, type Migration } from "../migration-file.ts";
import { namespaceName } from "../query-file.ts";
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

/** `*.sql` files under `dir`, relative and `/`-separated, skipping `_` files and folders (drafts). */
const queryFiles = async (dir: string, prefix = ""): Promise<string[]> => {
	const entries: Dirent[] = await readdir(dir, { withFileTypes: true }).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		},
	);
	const files: string[] = [];
	for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
		if (entry.name.startsWith("_")) continue;
		const rel = prefix + entry.name;
		if (entry.isDirectory()) files.push(...(await queryFiles(join(dir, entry.name), `${rel}/`)));
		else if (entry.name.endsWith(".sql")) files.push(rel);
	}
	return files;
};

/**
 * Reads and checks every `*.sql` query in `dir` against the migrated schema.
 * A subfolder is a namespace: `todos/mark-done.sql` is `todos.markDone`. Any
 * mismatch throws, so a bad query stops the build.
 */
export async function scanQueries(
	dir: string,
	migrations: readonly Migration[],
): Promise<AnalyzedQuery[]> {
	const files = await queryFiles(dir);
	if (files.length === 0) return [];

	const scratch = await scratchDatabase(migrations);
	// Each name is a query or a folder; `db.todos` can't be both a function and an object.
	const owners = new Map<string, { kind: "query" | "folder"; file: string }>();
	const claim = (name: string, kind: "query" | "folder", file: string) => {
		const owner = owners.get(name);
		if (owner && (owner.kind === "query" || kind === "query"))
			throw new SqlError("QUERY_DUP", `${name} is given by both ${owner.file} and ${file}`, {
				file,
				hint: "Rename one of them.",
			});
		owners.set(name, { kind, file });
	};
	const queries: AnalyzedQuery[] = [];
	for (const file of files) {
		const analyzed = await analyzeQuery(scratch, file, await readFile(join(dir, file), "utf8"));
		const space = file
			.split("/")
			.slice(0, -1)
			.map((folder) => namespaceName(folder, file));
		for (let i = 1; i <= space.length; i++) claim(space.slice(0, i).join("."), "folder", file);
		const name = [...space, analyzed.name].join(".");
		claim(name, "query", file);
		queries.push({ ...analyzed, name });
	}
	return queries;
}
