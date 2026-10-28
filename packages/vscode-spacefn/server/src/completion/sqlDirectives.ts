import type { CompletionItem } from "vscode-languageserver/node";

import { inRange, type TemplateRange } from "./types";

const DIRECTIVES = ["name:", "@param", "@column", "case", "when", "end"];
const SQL_TYPES = ["integer", "text", "real", "boolean", "timestamp", "uuid", "json"];
const MODES = [":one", ":many", ":exec"];

/** Completions for `--` directive comments in SQL files and sql`` templates. Pure. */
export function sqlDirectiveCompletions(
	ctx: { text: string; offset: number; isSqlFile: boolean; isJsTs: boolean },
	sqlRange: TemplateRange | null,
	findSqlTemplate: (text: string, offset: number) => TemplateRange | null,
): CompletionItem[] | null {
	let range: TemplateRange | null = sqlRange;
	if (!range) {
		if (ctx.isSqlFile) range = { start: 0, end: ctx.text.length, contentStart: 0 };
		else if (ctx.isJsTs) range = findSqlTemplate(ctx.text, ctx.offset);
	}
	if (!range || !inRange(range, ctx.offset)) return null;
	const beforeCursor = ctx.text.slice(range.contentStart, ctx.offset);
	const lines = beforeCursor.split("\n");
	const currentLine = lines[lines.length - 1] ?? "";
	const trimmed = currentLine.trimStart();
	if (!trimmed.startsWith("--")) return null;
	const afterDashes = trimmed.replace(/^--\s*/, "");
	const paramNames = [...ctx.text.matchAll(/--\s*@param\s+([A-Za-z_]\w*)/g)].map((m) => m[1]!);
	let items: { label: string; kind: number; insertText: string; detail?: string }[] = [];
	if (afterDashes === "" || !afterDashes.includes(" ")) {
		items = DIRECTIVES.filter((d) => d.startsWith(afterDashes)).map((d) => ({
			label: "-- " + d,
			kind: 14,
			insertText: d,
			detail: "sql directive",
		}));
	} else if (afterDashes.startsWith("when")) {
		const rest = afterDashes.slice(4).trim();
		const prefix = rest.split(/\s*,\s*/).pop() ?? "";
		items = paramNames
			.filter((n) => n.toLowerCase().startsWith(prefix.toLowerCase()))
			.map((n) => ({ label: n, kind: 6, insertText: n, detail: "param" }));
	} else if (afterDashes.startsWith("name:")) {
		items = MODES.filter((m) => m.startsWith(afterDashes.slice(5).trim())).map((m) => ({
			label: m,
			kind: 14,
			insertText: m,
			detail: "query mode",
		}));
	} else if (afterDashes.startsWith("@param") || afterDashes.startsWith("@column")) {
		const rest = afterDashes.replace(/^@(param|column)\s+\w*\s*/, "");
		items = SQL_TYPES.filter((t) => t.startsWith(rest)).map((t) => ({
			label: t,
			kind: 14,
			insertText: t,
			detail: "sql type",
		}));
	}
	return items.length ? (items as CompletionItem[]) : null;
}
