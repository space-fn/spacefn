export interface NamedSql {
	/** The SQL with each `:name` replaced by `?`. */
	sql: string;
	/** Parameter names in the order their placeholders appear. A name may repeat. */
	names: string[];
}

/**
 * Rewrites `:name` placeholders to `?` so the database binds them by position.
 * Placeholders inside string literals and comments are left alone. Positional
 * `?` is rejected, so every value has a name.
 */
export function namedParams(sql: string): NamedSql {
	let out = "";
	const names: string[] = [];
	let i = 0;
	while (i < sql.length) {
		const char = sql[i] as string;
		if (char === "'" || char === '"') {
			const end = findClose(sql, i, char);
			out += sql.slice(i, end);
			i = end;
			continue;
		}
		if (char === "-" && sql[i + 1] === "-") {
			const end = sql.indexOf("\n", i);
			const stop = end === -1 ? sql.length : end;
			out += sql.slice(i, stop);
			i = stop;
			continue;
		}
		if (char === "?") {
			throw new Error(
				"Use named parameters (:name) instead of ? in queries, so every value has a name",
			);
		}
		if (char === ":" && /[A-Za-z_]/.test(sql[i + 1] ?? "") && sql[i - 1] !== ":") {
			const match = /^[A-Za-z_]\w*/.exec(sql.slice(i + 1)) as RegExpExecArray;
			names.push(match[0]);
			out += "?";
			i += 1 + match[0].length;
			continue;
		}
		out += char;
		i++;
	}
	return { sql: out, names };
}

function findClose(sql: string, start: number, quote: string): number {
	let i = start + 1;
	while (i < sql.length) {
		if (sql[i] === quote) {
			if (sql[i + 1] === quote) {
				i += 2;
				continue;
			}
			return i + 1;
		}
		i++;
	}
	return sql.length;
}
