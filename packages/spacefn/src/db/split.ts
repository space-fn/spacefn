const TRANSACTION_ERROR =
	"Transaction statements (BEGIN, COMMIT, ROLLBACK, END) are not allowed in migrations: " +
	"each statement runs in its own transaction.";

/**
 * Splits a SQL script into single statements. Respects single and double quotes,
 * `--` and `/* *\/` comments, and `BEGIN ... END` trigger bodies, so triggers stay
 * whole. `CASE ... END` is counted on its own, so it cannot close a trigger body.
 * Transaction statements (`BEGIN`, `COMMIT`, `ROLLBACK`, `END`) are refused:
 * the runner wraps every statement in its own transaction.
 */
export function splitStatements(script: string): string[] {
	const statements: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	let depth = 0;
	let caseDepth = 0;
	let i = 0;

	const isWordAt = (word: string, at: number) => {
		const before = script[at - 1];
		const after = script[at + word.length];
		const bounded = (c: string | undefined) => c === undefined || !/[A-Za-z0-9_]/.test(c);
		return (
			script.slice(at, at + word.length).toUpperCase() === word && bounded(before) && bounded(after)
		);
	};

	while (i < script.length) {
		const char = script[i] as string;

		if (quote) {
			current += char;
			if (char === quote) quote = undefined;
			i++;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			current += char;
			i++;
			continue;
		}
		if (char === "-" && script[i + 1] === "-") {
			const end = script.indexOf("\n", i);
			const stop = end === -1 ? script.length : end;
			current += script.slice(i, stop);
			i = stop;
			continue;
		}
		if (char === "/" && script[i + 1] === "*") {
			const end = script.indexOf("*/", i + 2);
			const stop = end === -1 ? script.length : end + 2;
			current += script.slice(i, stop);
			i = stop;
			continue;
		}
		if (isWordAt("CASE", i)) {
			caseDepth++;
		} else if (isWordAt("END", i)) {
			if (caseDepth > 0) caseDepth--;
			else if (depth > 0) depth--;
			else throw new Error(TRANSACTION_ERROR);
		} else if (isWordAt("BEGIN", i)) {
			// Only the BEGIN that opens a trigger body starts a block.
			if (depth === 0 && /create\s+trigger/i.test(current)) depth++;
			else throw new Error(TRANSACTION_ERROR);
		} else if (isWordAt("COMMIT", i) || isWordAt("ROLLBACK", i)) {
			throw new Error(TRANSACTION_ERROR);
		}

		if (char === ";" && depth === 0) {
			const statement = current.trim();
			if (statement && statement.replace(/--[^\n]*/g, "").trim()) statements.push(statement);
			current = "";
			i++;
			continue;
		}
		current += char;
		i++;
	}

	const rest = current.trim();
	if (rest && rest.replace(/--[^\n]*/g, "").trim()) statements.push(rest);
	return statements;
}
