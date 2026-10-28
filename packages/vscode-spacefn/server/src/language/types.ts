import type * as cssService from "vscode-css-languageservice";
import type * as htmlService from "vscode-html-languageservice";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Position } from "vscode-languageserver/node";

export interface ColumnInfo {
	name: string;
	type: string;
	notnull?: boolean;
	pk?: boolean;
	defaultValue?: string | null;
}

export interface SchemaInfo {
	tables: string[];
	columns: Map<string, ColumnInfo[]>;
}

export interface DatastarDoc {
	syntax: string;
	description: string;
	modifiers: string[];
	example: string;
}

export interface DatastarActionDoc {
	syntax: string;
	description: string;
	options: string[];
}

/** Shared dependencies for hover and definition providers. */
export interface LanguageDeps {
	htmlLS: htmlService.LanguageService;
	cssLS: cssService.LanguageService;
	htmlService: typeof htmlService;
	getSchema: (dbDir: string, targetDb: string) => Promise<SchemaInfo>;
	datastarDocs: Record<string, DatastarDoc>;
	datastarActionDocs: Record<string, DatastarActionDoc>;
	readDir: (dir: string) => Promise<string[]>;
	readFile: (path: string) => Promise<string>;
	joinPath: (...parts: string[]) => string;
}

export interface LanguageCtx {
	doc: TextDocument;
	text: string;
	offset: number;
	filePath: string;
	isJsTs: boolean;
	position: Position;
}
