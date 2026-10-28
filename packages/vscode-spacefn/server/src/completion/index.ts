import { findCssTemplateRange, findHtmlTemplateRange, findSqlTemplateRange } from "../lib/helpers";
import { cssCompletions } from "./css";
import { datastarCompletions } from "./datastar";
import { sqlCompletions } from "./sql";
import { sqlDirectiveCompletions } from "./sqlDirectives";
import type { CompletionCtx, CompletionDeps, CompletionResult, TemplateRange } from "./types";

export * from "./types";

export type { CompletionDeps, CompletionResult, CompletionCtx, TemplateRange };
export { cssCompletions } from "./css";
export { datastarCompletions } from "./datastar";
export { sqlCompletions } from "./sql";
export { sqlDirectiveCompletions } from "./sqlDirectives";

/** Dispatch completion to the right context provider. */
export async function complete(
	ctx: CompletionCtx,
	deps: CompletionDeps,
	resolveDbDir: (filePath: string) => { dbDir: string; targetDb: string } | null,
): Promise<CompletionResult> {
	const { text, offset, filePath, isJsTs, doc } = ctx;
	const cssTpl: TemplateRange | null = isJsTs ? findCssTemplateRange(text, offset) : null;
	if (cssTpl) {
		const css = cssCompletions(deps, { doc, text, offset }, cssTpl);
		if (css && css.length) return css;
	}

	const sqlRange: TemplateRange | null = isJsTs ? findSqlTemplateRange(text, offset) : null;
	const directives = sqlDirectiveCompletions(
		{ text, offset, isSqlFile: filePath.endsWith(".sql"), isJsTs },
		sqlRange,
		findSqlTemplateRange,
	);
	if (directives && directives.length) return directives;

	const tpl: TemplateRange | null = isJsTs ? findHtmlTemplateRange(text, offset) : null;
	if (tpl) {
		const html = datastarCompletions(deps, { doc, text, offset }, tpl);
		if (html && html.length) return html;
	}

	return sqlCompletions(deps, { filePath, text, offset }, resolveDbDir);
}
