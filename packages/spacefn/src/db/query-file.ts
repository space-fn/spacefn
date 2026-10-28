import { SpaceError } from "../errors";
export type QueryMode = "one" | "many" | "exec";

export interface QueryPart {
	/** Raw SQL for this part (annotations already removed, `:param` intact). */
	sql: string;
	/** Gate parameter names; `null` means always included. */
	gate: string[] | null;
}

export interface QueryFile {
	/** Function name, from `-- name: findTodo :one`. */
	name: string;
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

const HEADER = /^--\s*name:\s*([A-Za-z_]\w*)\s*:(one|many|exec)\s*$/;
const ANNOTATION = /^--\s*@(column|param)\s+([A-Za-z_]\w*)\s+(\S+)\s*$/;
const CASE_OPEN = /^--\s*case\s*$/;
const WHEN = /^--\s*when\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*$/;
const CASE_CLOSE = /^--\s*end\s*$/;

export function parseQueryFile(file: string, text: string): QueryFile {
	const lines = text.split("\n");
	const header = lines.find((line) => line.trim() !== "");
	const match = header ? HEADER.exec(header.trim()) : null;
	if (!match) {
		throw new SpaceError(
			"QUERY_HEADER",
			`${file} must start with "-- name: <function> :one|:many|:exec"`,
			{ file, hint: "Add the header line as the first non-empty line." },
		);
	}

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
		if (HEADER.test(trimmed)) continue;

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
					throw new SpaceError(
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
	return { name: match[1] as string, mode: match[2] as QueryMode, sql, columns, params, parts };
}
