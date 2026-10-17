/**
 * Splits a SQL script into single statements. Respects single and double quotes,
 * `--` and `/* *\/` comments, and `BEGIN ... END` blocks, so trigger bodies stay whole.
 */
export function splitStatements(script: string): string[] {
	const statements: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	let depth = 0;
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
		if (isWordAt("BEGIN", i)) depth++;
		if (isWordAt("END", i) && depth > 0) depth--;

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
