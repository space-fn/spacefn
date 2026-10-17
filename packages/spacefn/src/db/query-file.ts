export type QueryMode = "one" | "many" | "exec";

export interface QueryFile {
	/** Function name, from `-- name: findTodo :one`. */
	name: string;
	mode: QueryMode;
	/** The SQL with annotation comments removed. */
	sql: string;
	/** Result column types given by `-- @column name type`. */
	columns: Record<string, string>;
	/** Parameter types given by `-- @param name type`. */
	params: Record<string, string>;
}

const HEADER = /^--\s*name:\s*([A-Za-z_]\w*)\s*:(one|many|exec)\s*$/;
const ANNOTATION = /^--\s*@(column|param)\s+([A-Za-z_]\w*)\s+(\S+)\s*$/;

/**
 * Reads a `.sql` query file. The first line must be `-- name: <fn> :one|:many|:exec`.
 * Optional `-- @column` and `-- @param` lines give types the database cannot.
 */
export function parseQueryFile(file: string, text: string): QueryFile {
	const lines = text.split("\n");
	const header = lines.find((line) => line.trim() !== "");
	const match = header ? HEADER.exec(header.trim()) : null;
	if (!match) {
		throw new Error(`${file} must start with "-- name: <function> :one|:many|:exec"`);
	}

	const columns: Record<string, string> = {};
	const params: Record<string, string> = {};
	const sql: string[] = [];
	for (const line of lines) {
		const annotation = ANNOTATION.exec(line.trim());
		if (annotation) {
			const [, kind, name, type] = annotation as unknown as [string, string, string, string];
			(kind === "column" ? columns : params)[name] = type;
			continue;
		}
		if (HEADER.test(line.trim())) continue;
		sql.push(line);
	}

	return {
		name: match[1] as string,
		mode: match[2] as QueryMode,
		sql: sql.join("\n").trim(),
		columns,
		params,
	};
}
