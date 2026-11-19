import type { Field, InferEnv, Schema } from "./fields";

export class EnvError extends Error {
	constructor(readonly issues: string[]) {
		super(`Invalid environment:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
		this.name = "EnvError";
	}
}

type Parsed = { ok: true; value: unknown } | { ok: false; issue: string };

function parseValue(key: string, field: Field, raw: string): Parsed {
	const shown = field.secret ? "" : `, got "${raw}"`;
	switch (field.kind) {
		case "string":
			return { ok: true, value: raw };
		case "number": {
			const value = Number(raw);
			if (raw.trim() === "" || !Number.isFinite(value)) {
				return { ok: false, issue: `${key} must be a number${shown}` };
			}
			return { ok: true, value };
		}
		case "boolean": {
			const lower = raw.toLowerCase();
			if (lower === "true" || lower === "1") return { ok: true, value: true };
			if (lower === "false" || lower === "0") return { ok: true, value: false };
			return { ok: false, issue: `${key} must be true, false, 1 or 0${shown}` };
		}
	}
}

/** Reads `raw` through `schema`. Throws one `EnvError` listing every problem. */
export function parseEnv<S extends Schema>(schema: S, raw: Record<string, unknown>): InferEnv<S> {
	const result: Record<string, unknown> = {};
	const issues: string[] = [];

	for (const [key, field] of Object.entries(schema)) {
		const value = raw[key];
		if (value === undefined) {
			if (field.default !== undefined) result[key] = field.default;
			else if (!field.optional) issues.push(`${key} is required`);
			continue;
		}
		if (typeof value !== "string") {
			issues.push(`${key} must be text`);
			continue;
		}
		const parsed = parseValue(key, field, value);
		if (parsed.ok) result[key] = parsed.value;
		else issues.push(parsed.issue);
	}

	if (issues.length > 0) throw new EnvError(issues);
	return result as InferEnv<S>;
}
