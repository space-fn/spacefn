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
