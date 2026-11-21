import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";

/** Whether the `package.json` in `dir` depends on spacefn, which makes `dir` an app's root. */
function dependsOnSpacefn(dir: string): boolean {
	try {
		const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as Record<
			string,
			Record<string, unknown> | undefined
		>;
		return ["dependencies", "devDependencies"].some((field) => pkg[field]?.spacefn !== undefined);
	} catch {
		return false;
	}
}

/** The nearest folder above `filePath` whose `package.json` depends on spacefn, or null outside an app. */
export function findAppRoot(filePath: string): string | null {
	for (let dir = path.dirname(filePath); ; dir = path.dirname(dir)) {
		if (dependsOnSpacefn(dir)) return dir;
		if (dir === path.dirname(dir)) return null;
	}
}

/** The databases of an app, as codegen sees them: folders in `app/db/`, but not `_drafts`. */
export function dbNames(dbDir: string): string[] {
	try {
		return readdirSync(dbDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
			.map((entry) => entry.name)
			.sort();
	} catch {
		return [];
	}
}

const IMPORTED_DB = /["']#space\/db\/([A-Za-z0-9_-]+)(?:\.ts)?["']/;

/** The database a source imports from generated code (`#space/db/main.ts`), if any. */
export function importedDb(source: string): string | null {
	return IMPORTED_DB.exec(source)?.[1] ?? null;
}

export interface ResolvedDb {
	/** `app/db/`. */
	readonly dbDir: string;
	/** `app/db/<name>/`, whose migrations give the schema. */
	readonly targetDb: string;
}

/**
 * Which database a file's SQL runs against: the one whose `queries/` holds
 * it; else, anywhere in the app, the one it imports from `#space/db/`; else
 * the app's only database. Null when that can't be told.
 */
export function resolveDb(filePath: string, source?: string): ResolvedDb | null {
	const inQueries = /^(.*[/\\]app[/\\]db)[/\\]([^/\\]+)[/\\]queries[/\\]/.exec(filePath);
	if (inQueries) return { dbDir: inQueries[1]!, targetDb: path.join(inQueries[1]!, inQueries[2]!) };
	const root = findAppRoot(filePath);
	if (!root) return null;
	const dbDir = path.join(root, "app", "db");
	const names = dbNames(dbDir);
	let text = source;
	if (text === undefined)
		try {
			text = readFileSync(filePath, "utf8");
		} catch {
			text = "";
		}
	const imported = importedDb(text);
	const name =
		imported && names.includes(imported) ? imported : names.length === 1 ? names[0] : null;
	return name ? { dbDir, targetDb: path.join(dbDir, name) } : null;
}
