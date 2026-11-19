import type { AnalyzedQuery } from "@spacefn/sql";

import { SQL_TYPE, type PlannedDb } from "./plan.ts";
import { GENERATED } from "./render-manifest.ts";

const TS_TYPE: Record<string, string> = {
	string: "string",
	number: "number",
	boolean: "boolean",
	bytes: "Uint8Array",
	unknown: "unknown",
};

const tsType = (type: string, nullable: boolean) => {
	const base = TS_TYPE[type] ?? "unknown";
	return nullable && base !== "unknown" ? `${base} | null` : base;
};

/** A declared `@param` type, e.g. `string?`. Planning has already checked it. */
const paramType = (declared: string | undefined) => {
	const match = declared ? SQL_TYPE.exec(declared) : null;
	return match ? tsType(match[1] as string, match[2] === "?") : "unknown";
};

const pascal = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);
const str = JSON.stringify;

/** Parameters used only inside `-- case` arms may be left out. */
const optionalParams = (query: AnalyzedQuery) => {
	const always = new Set(query.parts.filter((p) => p.gate === null).flatMap((p) => p.paramNames));
	return new Set(query.paramNames.filter((name) => !always.has(name)));
};

const renderTypes = (query: AnalyzedQuery) => {
	const base = pascal(query.name);
	const optional = optionalParams(query);
	const params = [...new Set(query.paramNames)].map(
		(name) =>
			`\treadonly ${name}${optional.has(name) ? "?" : ""}: ${paramType(query.paramTypes[name])};`,
	);
	const columns = query.columns.map((c) => `\treadonly ${c.name}: ${tsType(c.type, c.nullable)};`);
	return [
		params.length
			? `export interface ${base}Params {\n${params.join("\n")}\n}`
			: `export type ${base}Params = Record<string, never>;`,
		...(query.mode === "exec" ? [] : [`export interface ${base}Row {\n${columns.join("\n")}\n}`]),
	];
};

const renderQuery = (query: AnalyzedQuery) => {
	const parts = query.parts.map(
		(p) => `\t\t\t{ sql: ${str(p.sql)}, params: ${str(p.paramNames)}, gate: ${str(p.gate)} },`,
	);
	return [
		`\t${query.name}: {`,
		`\t\tmode: ${str(query.mode)},`,
		`\t\tcolumns: ${str(query.columns.map((c) => c.name))},`,
		"\t\tparts: [",
		...parts,
		"\t\t],",
		"\t},",
	];
};

/**
 * Source of `.space/db/<name>.ts`: the migrations, each query's SQL parts, and
 * the `Params` / `Row` types of every query. Plain data; the db runtime runs it.
 */
export const renderDb = (db: PlannedDb): string => {
	const migrations = db.migrations.map(
		(m) =>
			`\t{ id: ${str(m.id)}, sql: ${str(m.sql)}${m.down === undefined ? "" : `, down: ${str(m.down)}`} },`,
	);
	const map = db.queries.map(
		(q) =>
			`\t${q.name}: { params: ${pascal(q.name)}Params; row: ${q.mode === "exec" ? "never" : `${pascal(q.name)}Row`}; mode: ${str(q.mode)} };`,
	);
	return [
		GENERATED,
		"",
		...db.queries.flatMap(renderTypes).flatMap((block) => [block, ""]),
		`export const name = ${str(db.name)};`,
		`export const driver = ${str(db.driver)};`,
		"",
		"export const migrations = [",
		...migrations,
		"] as const;",
		"",
		"export const queries = {",
		...db.queries.flatMap(renderQuery),
		"} as const;",
		"",
		"export interface Queries {",
		...map,
		"}",
		"",
	].join("\n");
};
