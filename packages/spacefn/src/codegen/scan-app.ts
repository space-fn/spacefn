import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { Effect } from "effect";

import { SpaceError } from "../errors.ts";
import type { AnalyzedQuery, Migration } from "../sql/index.ts";
import { scanMigrations, scanQueries } from "../sql/node/index.ts";
import { CODE_FILE, isTestFile } from "./route-path.ts";

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
	/** Whether `configs/infra.ts` exists, for the generated infra to merge. */
	readonly infraConfig: boolean;
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
	/**
	 * Whether code in `app/` or the alias folders imports `Kv` or `Blob` from
	 * spacefn, so the infra creates a KV namespace or an R2 bucket only when used.
	 */
	readonly uses: { readonly kv: boolean; readonly blob: boolean };
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

const readText = (file: string) =>
	Effect.tryPromise({ try: () => readFile(file, "utf8"), catch: io(file) });

const SPACEFN_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']spacefn["']/g;

/** Value (not type-only) names imported from "spacefn" in `source`. */
export const spacefnImports = (source: string): Set<string> => {
	const names = new Set<string>();
	for (const match of source.matchAll(SPACEFN_IMPORT))
		for (const part of match[1]!.split(",")) {
			const name = part
				.trim()
				.split(/\s+as\s+/)[0]!
				.trim();
			if (name && !name.startsWith("type ")) names.add(name);
		}
	return names;
};

const scanUses = Effect.fnUntraced(function* (root: string, folders: readonly string[]) {
	const uses = { kv: false, blob: false };
	for (const folder of ["app", ...folders]) {
		const dir = join(root, folder);
		for (const file of yield* listFiles(dir, true)) {
			if (!CODE_FILE.test(file) || isTestFile(file)) continue;
			const names = spacefnImports(yield* readText(join(dir, file)));
			uses.kv ||= names.has("Kv");
			uses.blob ||= names.has("Blob");
		}
	}
	return uses;
});

/**
 * Reads `<root>/app` into an {@link AppTree}. A missing folder is an empty
 * listing. `folders` (the alias folders) are only read for {@link AppTree.uses}.
 */
export const scanApp = Effect.fnUntraced(function* (
	root: string,
	folders: readonly string[] = [],
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
		env: yield* exists(join(app, "env.ts")),
		layers: yield* exists(join(app, "layers.ts")),
		viteConfig: yield* exists(join(root, "configs", "vite.config.ts")),
		infraConfig: yield* exists(join(root, "configs", "infra.ts")),
		routes: yield* listFiles(join(app, "routes"), true),
		queues: yield* flat("queues"),
		crons,
		durableObjects: yield* flat("durable-objects"),
		workflows: yield* flat("workflows"),
		client: yield* flat("client"),
		db: yield* Effect.forEach(dbNames, (name) => scanDb(join(app, "db", name), name)),
		cronSources,
		uses: yield* scanUses(root, folders),
		gitignore: yield* Effect.tryPromise({
			try: () => readFile(join(root, ".gitignore"), "utf8").catch(missingIsEmpty(undefined)),
			catch: io(".gitignore"),
		}),
	};
});
