import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { Effect } from "effect";

import { SpaceError } from "../errors.ts";
import type { AnalyzedQuery, Migration } from "../sql/index.ts";
import { scanMigrations, scanQueries } from "../sql/node/index.ts";
import { CODE_FILE } from "./route-path.ts";

export interface DbFolder {
	/** Folder name under `app/db/`. */
	readonly name: string;
	readonly migrations: readonly Migration[];
	/** Queries already checked against the migrated schema. */
	readonly queries: readonly AnalyzedQuery[];
	/** The text of `config.json`, if the folder has one; the planner checks it. */
	readonly config: string | undefined;
}

/**
 * What `app/` contains, as plain data. Folder listings are raw file names
 * (relative, `/`-separated, sorted); the planner decides which ones count.
 */
export interface AppTree {
	readonly env: boolean;
	/** Whether `app/entry.ts` exists; every app has one. */
	readonly entry: boolean;
	/** Every file under `app/routes/`, recursively: routes, pages, `_middleware.ts` and private files. */
	readonly routes: readonly string[];
	/** Files directly inside each folder. */
	readonly queues: readonly string[];
	readonly crons: readonly string[];
	readonly durableObjects: readonly string[];
	readonly workflows: readonly string[];
	readonly client: readonly string[];
	readonly db: readonly DbFolder[];
	/** Source of each file in `app/crons/`, for the schedule the infra needs. */
	readonly cronSources: Readonly<Record<string, string>>;
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
	const config = yield* Effect.tryPromise({
		try: () => readFile(join(dir, "config.json"), "utf8").catch(missingIsEmpty(undefined)),
		catch: io(`app/db/${name}/config.json`),
	});
	return { name, migrations, queries, config } satisfies DbFolder;
});

const readText = (file: string) =>
	Effect.tryPromise({ try: () => readFile(file, "utf8"), catch: io(file) });

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

	const crons = yield* flat("crons");
	const cronSources: Record<string, string> = {};
	for (const file of crons)
		if (CODE_FILE.test(file)) cronSources[file] = yield* readText(join(app, "crons", file));

	return {
		env: yield* exists(join(root, "configs", "env.ts")),
		entry: yield* exists(join(app, "entry.ts")),
		routes: yield* listFiles(join(app, "routes"), true),
		queues: yield* flat("queues"),
		crons,
		durableObjects: yield* flat("durable-objects"),
		workflows: yield* flat("workflows"),
		client: yield* flat("client"),
		db: yield* Effect.forEach(dbNames, (name) => scanDb(join(app, "db", name), name)),
		cronSources,
		gitignore: yield* Effect.tryPromise({
			try: () => readFile(join(root, ".gitignore"), "utf8").catch(missingIsEmpty(undefined)),
			catch: io(".gitignore"),
		}),
	};
});
