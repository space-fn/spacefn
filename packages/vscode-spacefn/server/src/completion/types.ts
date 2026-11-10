import type * as cssService from "vscode-css-languageservice";
import type * as htmlService from "vscode-html-languageservice";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { CompletionItem } from "vscode-languageserver/node";

export interface ColumnInfo {
	name: string;
	type: string;
}

export interface SchemaInfo {
	tables: string[];
	columns: Map<string, ColumnInfo[]>;
}

/** A tagged-template range: absolute start/end offsets and the offset of the content. */
export interface TemplateRange {
	start: number;
	end: number;
	contentStart: number;
}

/** Everything a completion provider needs, injected by the caller. */
export interface CompletionDeps {
	htmlLS: htmlService.LanguageService;
	cssLS: cssService.LanguageService;
	customProps: Map<string, string>;
	getSchema: (dbDir: string, targetDb: string) => Promise<SchemaInfo>;
	htmlService: typeof htmlService;
}

export type CompletionResult = CompletionItem[] | null;

export interface CompletionCtx {
	doc: TextDocument;
	text: string;
	offset: number;
	filePath: string;
	isJsTs: boolean;
}

export function inRange(range: TemplateRange, offset: number): boolean {
	return offset >= range.contentStart && offset <= range.end;
}

/** A text edit replacing `[start, end)` of `doc`, so the client never guesses the word to replace. */
export function editAt(doc: TextDocument, start: number, end: number, newText: string) {
	return { range: { start: doc.positionAt(start), end: doc.positionAt(end) }, newText };
}

type Pos = { line: number; character: number };
type Range = { start: Pos; end: Pos };

/**
 * Moves a completion item's edit from an embedded document back into the host file.
 * `toHost` turns an offset in the embedded document into an offset in the host.
 */
export function mapItemEdit(
	item: CompletionItem,
	embedded: { offsetAt(p: Pos): number },
	host: TextDocument,
	toHost: (offset: number) => number,
): CompletionItem {
	const map = (r: Range): Range => ({
		start: host.positionAt(toHost(embedded.offsetAt(r.start))),
		end: host.positionAt(toHost(embedded.offsetAt(r.end))),
	});
	const te = item.textEdit as
		| { range: Range; newText: string }
		| { insert: Range; replace: Range; newText: string }
		| undefined;
	if (!te) return item;
	if ("range" in te) return { ...item, textEdit: { range: map(te.range), newText: te.newText } };
	return {
		...item,
		textEdit: { insert: map(te.insert), replace: map(te.replace), newText: te.newText },
	};
}
