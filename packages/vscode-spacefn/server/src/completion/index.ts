import { cssRegionAt } from "../lib/cssRegions";
import { findHtmlTemplateRange, findSqlTemplateRange } from "../lib/helpers";
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
	const css = isJsTs ? cssRegionAt(text, offset) : null;
	// Nothing else applies inside CSS, so an empty list is the answer there.
	if (css) return cssCompletions(deps, { doc, offset }, css);

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
