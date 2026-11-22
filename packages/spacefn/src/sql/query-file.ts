import { SqlError } from "./error.ts";
import { splitStatements } from "./split.ts";

export type QueryMode = "one" | "many" | "exec";

export interface QueryPart {
	/** Raw SQL for this part (annotations already removed, `:param` intact). */
	sql: string;
	/** Gate parameter names; `null` means always included. */
	gate: string[] | null;
}

export interface QueryFile {
	/**
	 * Function name, from the file name: `find-todo.sql` gives `findTodo`. A
	 * scan of `queries/` prefixes subfolders: `todos/mark-done.sql` is `todos.markDone`.
	 */
	name: string;
	/** `-- :one` / `:many` / `:exec` if the file has one, else read from the statement. */
	mode: QueryMode;
	/** The SQL with annotation comments removed (all parts joined). */
	sql: string;
	/** Result column types given by `-- @column name type`. */
	columns: Record<string, string>;
	/** Parameter types given by `-- @param name type`. */
	params: Record<string, string>;
	/** Ordered parts; `gate` null means always included. */
	parts: QueryPart[];
}

const MODE = /^--\s*:(one|many|exec)\s*$/;
const OLD_HEADER = /^--\s*name:/;
const FILE_NAME = /^([a-z][a-zA-Z0-9]*(?:[-_][a-zA-Z0-9]+)*)\.sql$/;
const ANNOTATION = /^--\s*@(column|param)\s+([A-Za-z_]\w*)\s+(\S+)\s*$/;
const CASE_OPEN = /^--\s*case\s*$/;
const WHEN = /^--\s*when\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*$/;
const CASE_CLOSE = /^--\s*end\s*$/;

const camel = (words: string) =>
	words.replace(/[-_]([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase());

const FOLDER_NAME = /^[a-z][a-zA-Z0-9]*(?:[-_][a-zA-Z0-9]+)*$/;

/** `add-todo.sql`, `add_todo.sql` and `addTodo.sql` all give `addTodo`. Only the file name counts. */
export function queryName(file: string): string {
	const base = file.split(/[\\/]/).pop() ?? file;
	const match = FILE_NAME.exec(base);
	if (!match)
		throw new SqlError("QUERY_NAME", `"${base}" doesn't give a function name`, {
			file,
			hint: "Name the file with letters and digits, words split by - or _, starting with a lowercase letter: add-todo.sql.",
		});
	return camel(match[1]!);
}

/** A folder in `queries/` is a namespace: `todo-items/` gives `todoItems`. */
export function namespaceName(folder: string, file: string): string {
	if (!FOLDER_NAME.test(folder))
		throw new SqlError("QUERY_NAME", `The folder "${folder}" doesn't give a namespace name`, {
			file,
			hint: "Name it like a query file: letters and digits, words split by - or _, starting with a lowercase letter.",
		});
	return camel(folder);
}

/**
 * What a statement returns when the file doesn't say: rows for `SELECT`,
 * `VALUES`, a `WITH` that only reads, and anything with `RETURNING`; nothing
 * otherwise. `-- :one` is never inferred.
 */
export function inferMode(sql: string): QueryMode {
	const code = sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
	if (/\bRETURNING\b/i.test(code)) return "many";
	const first = /^\s*(\w+)/.exec(code)?.[1]?.toUpperCase();
	if (first === "SELECT" || first === "VALUES") return "many";
	if (first === "WITH") return /\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(code) ? "exec" : "many";
	return "exec";
}

export function parseQueryFile(file: string, text: string): QueryFile {
	const lines = text.split("\n");
	if (lines.some((line) => OLD_HEADER.test(line.trim())))
		throw new SqlError(
			"QUERY_NAME_HEADER",
			`${file}: the query's name comes from its file name now`,
			{
				file,
				hint: "Remove the -- name: line. To return one row, write -- :one on a line of its own.",
			},
		);
	const name = queryName(file);
	const modes = lines.flatMap((line) => MODE.exec(line.trim())?.[1] ?? []);
	if (modes.length > 1)
		throw new SqlError("QUERY_MODE", `${file} sets its mode ${modes.length} times`, {
			file,
			hint: "Keep one -- :one, -- :many or -- :exec line.",
		});

	const columns: Record<string, string> = {};
	const params: Record<string, string> = {};
	const parts: QueryPart[] = [];
	let inCase = false;
	let currentGate: string[] | null = null;
	let currentLines: string[] = [];
	let baseLines: string[] = [];
	let basePending = false;

	function flushArm() {
		const body = currentLines.join("\n");
		if (body.trim() !== "") {
			parts.push({ sql: body, gate: currentGate });
		}
		currentLines = [];
	}

	function flushBase() {
		const body = baseLines.join("\n");
		if (body.trim() !== "") parts.push({ sql: body, gate: null });
		baseLines = [];
		basePending = false;
	}

	for (const line of lines) {
		const trimmed = line.trim();
		const annotation = ANNOTATION.exec(trimmed);
		if (annotation) {
			const [, kind, name, type] = annotation as unknown as [string, string, string, string];
			(kind === "column" ? columns : params)[name] = type;
			continue;
		}
		if (MODE.test(trimmed)) continue;

		if (CASE_OPEN.test(trimmed)) {
			// flush pending outside-case text
			if (!inCase && currentLines.length > 0) {
				const body = currentLines.join("\n");
				if (body.trim() !== "") parts.push({ sql: body, gate: null });
				currentLines = [];
			}
			inCase = true;
			baseLines = [];
			basePending = true;
			currentGate = null;
			continue;
		}
		if (inCase && CASE_CLOSE.test(trimmed)) {
			flushBase();
			// flush last arm if any
			if (currentGate !== null) flushArm();
			inCase = false;
			currentGate = null;
			basePending = false;
			continue;
		}
		if (inCase) {
			const whenMatch = WHEN.exec(trimmed);
			if (whenMatch) {
				// flush base before first arm
				if (basePending) {
					flushBase();
					basePending = false;
				}
				// flush previous arm
				if (currentGate !== null) flushArm();
				const gate = whenMatch[1]!
					.split(/\s*,\s*/)
					.map((s) => s.trim())
					.filter(Boolean);
				currentGate = gate;
				continue;
			}
			if (basePending && currentGate === null) {
				baseLines.push(line);
			} else {
				currentLines.push(line);
			}
			continue;
		}

		// outside case
		currentLines.push(line);
	}

	// trailing
	if (inCase) {
		if (basePending) flushBase();
		if (currentGate !== null) flushArm();
	} else {
		if (currentLines.length > 0) {
			const body = currentLines.join("\n");
			if (body.trim() !== "") parts.push({ sql: body, gate: null });
		}
	}

	// validate gate params
	for (const part of parts) {
		if (part.gate) {
			for (const g of part.gate) {
				if (!(g in params)) {
					throw new SqlError(
						"QUERY_UNDECLARED_PARAM",
						`${file}: -- when references undeclared param "${g}"`,
						{ file, hint: `Add "-- @param ${g} <type>".` },
					);
				}
			}
		}
	}

	const sql = parts
		.map((p) => p.sql)
		.join("\n")
		.trim();
	if (splitStatements(sql).length > 1)
		throw new SqlError("QUERY_MULTIPLE", `${file} has more than one statement`, {
			file,
			hint: "Put each query in its own file; D1 can't run several with parameters at once.",
		});
	const mode = (modes[0] as QueryMode | undefined) ?? inferMode(sql);
	return { name, mode, sql, columns, params, parts };
}
