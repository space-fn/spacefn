import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import type { AnalyzedQuery, Migration } from "@spacefn/sql";
import { scanMigrations, scanQueries } from "@spacefn/sql/node";
import { Effect } from "effect";

import { SpaceError } from "../errors.ts";

export interface DbFolder {
	/** Folder name under `app/db/`. */
	readonly name: string;
	readonly migrations: readonly Migration[];
	/** Queries already checked against the migrated schema. */
	readonly queries: readonly AnalyzedQuery[];
}

/**
 * What `app/` contains, as plain data. Folder listings are raw file names
 * (relative, `/`-separated, sorted); the planner decides which ones count.
 */
export interface AppTree {
	readonly env: boolean;
	readonly layers: boolean;
	/** Whether `configs/vite.config.ts` exists, for the generated Vite config to merge. */
	readonly viteConfig: boolean;
	/** Every file under `app/routes/`, recursively. */
	readonly routes: readonly string[];
	/** Every file under `app/pages/`, recursively. */
	readonly pages: readonly string[];
	/** Files directly inside each folder. */
	readonly middleware: readonly string[];
	readonly queues: readonly string[];
	readonly crons: readonly string[];
	readonly durableObjects: readonly string[];
	readonly workflows: readonly string[];
	readonly client: readonly string[];
	readonly db: readonly DbFolder[];
	/** The root `.gitignore`, for the check that generated folders are ignored. */
	readonly gitignore: string | undefined;
}

const io = (file: string) => (cause: unknown) =>
	new SpaceError({ code: "SCAN_IO", message: `Could not read: ${String(cause)}`, file });

const missingIsEmpty =
	<A>(fallback: A) =>
	(error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT" || error.code === "ENOTDIR") return fallback;
		throw error;
	};

const byName = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

const listFiles = (dir: string, recursive: boolean) =>
	Effect.tryPromise({
		try: async () => {
			const entries = await readdir(dir, { recursive, withFileTypes: true }).catch(
				missingIsEmpty([]),
			);
			return entries
				.filter((entry) => entry.isFile())
				.map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
				.sort(byName);
		},
		catch: io(dir),
	});

const exists = (file: string) =>
	Effect.tryPromise({
		try: () => readFile(file).then(() => true, missingIsEmpty(false)),
		catch: io(file),
	});

/** SQL problems keep their stable code and point at the file under `app/db/`. */
const fromSql = (dbName: string, folder: "migrations" | "queries") => (cause: unknown) => {
	const error = cause as { code?: string; message?: string; hint?: string; file?: string };
	return new SpaceError({
		code: error.code ?? "DB_SCAN",
		message: error.message ?? String(cause),
		file: `app/db/${dbName}/${error.file ? `${folder}/${error.file}` : folder}`,
		...(error.hint ? { hint: error.hint } : {}),
	});
};

const scanDb = Effect.fnUntraced(function* (dir: string, name: string) {
	const migrations = yield* Effect.tryPromise({
		try: () => scanMigrations(join(dir, "migrations")),
		catch: fromSql(name, "migrations"),
	});
	const queries = yield* Effect.tryPromise({
		try: () => scanQueries(join(dir, "queries"), migrations),
		catch: fromSql(name, "queries"),
	});
	return { name, migrations, queries } satisfies DbFolder;
});

/** Reads `<root>/app` into an {@link AppTree}. A missing folder is an empty listing. */
export const scanApp = Effect.fnUntraced(function* (
	root: string,
): Effect.fn.Return<AppTree, SpaceError> {
	const app = join(root, "app");
	const flat = (folder: string) => listFiles(join(app, folder), false);
	const dbNames = yield* Effect.tryPromise({
		try: async () =>
			(await readdir(join(app, "db"), { withFileTypes: true }).catch(missingIsEmpty([])))
				.filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
				.map((entry) => entry.name)
				.sort(byName),
		catch: io("app/db"),
	});

	return {
		env: yield* exists(join(app, "env.ts")),
		layers: yield* exists(join(app, "layers.ts")),
		viteConfig: yield* exists(join(root, "configs", "vite.config.ts")),
		routes: yield* listFiles(join(app, "routes"), true),
		pages: yield* listFiles(join(app, "pages"), true),
		middleware: yield* flat("middleware"),
		queues: yield* flat("queues"),
		crons: yield* flat("crons"),
		durableObjects: yield* flat("durable-objects"),
		workflows: yield* flat("workflows"),
		client: yield* flat("client"),
		db: yield* Effect.forEach(dbNames, (name) => scanDb(join(app, "db", name), name)),
		gitignore: yield* Effect.tryPromise({
			try: () => readFile(join(root, ".gitignore"), "utf8").catch(missingIsEmpty(undefined)),
			catch: io(".gitignore"),
		}),
	};
});
