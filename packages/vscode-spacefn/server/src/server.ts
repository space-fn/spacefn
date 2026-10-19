import * as fs from "node:fs/promises";
import * as path from "node:path";

import { Parser } from "node-sql-parser";
import { scanMigrations, scratchDatabase } from "spacefn/db";
import * as htmlService from "vscode-html-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	Diagnostic,
	DiagnosticSeverity,
	CompletionItem,
	CompletionItemKind,
	Hover,
	Location,
	Position,
	Range,
	DidChangeWatchedFilesNotification,
} from "vscode-languageserver/node";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

async function loadDialectAndMigrations(dbDir: string) {
	let dialect: "sqlite" | "postgres" = "sqlite";
	try {
		const cfg = await import(path.join(dbDir, "config.ts"));
		dialect = (cfg.default ?? cfg).dialect ?? "sqlite";
	} catch {
		dialect = "sqlite";
	}
	const migrations = await scanMigrations(path.join(dbDir, "migrations"));
	return { dialect, migrations };
}

async function validateSqlFile(doc: TextDocument): Promise<void> {
	const uri = doc.uri;
	const filePath = uri.startsWith("file://") ? decodeURIComponent(uri.replace("file://", "")) : uri;
	console.error("[spacefn] validateSqlFile:", filePath);
	const m = filePath.match(/[/\\]app[/\\]db[/\\]([^/\\]+)[/\\]queries[/\\]/);
	if (!m) {
		console.error("[spacefn] no match, return");
		return;
	}
	const dbDir = filePath.replace(/[/\\]queries[/\\].*/, "");
	const diagnostics: Diagnostic[] = [];
	try {
		const { dialect, migrations } = await loadDialectAndMigrations(dbDir);
		const scratch = await scratchDatabase(migrations, dialect);
		// strip leading -- comment lines to get the SQL
		const text = doc.getText();
		const sql = text
			.split("\n")
			.filter((l) => !l.trim().startsWith("--"))
			.join("\n")
			.trim();
		console.error("[spacefn] sql:", JSON.stringify(sql));
		// validate -- name: directive
		const nameLine = text.split("\n").find((l) => l.trim().startsWith("-- name:"));
		if (nameLine) {
			const m = nameLine.match(/--\s*name:\s*(\S+)(?:\s+:(one|many|exec))?/);
			if (!m) {
				diagnostics.push({
					severity: 1,
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
					message: "Invalid -- name: directive",
					source: "spacefn",
				});
			} else if (!m[2]) {
				diagnostics.push({
					severity: 1,
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
					message: "Query mode must be :one, :many, or :exec",
					source: "spacefn",
				});
			}
		}
		if (sql) {
			const stmt = await scratch.prepare(sql);
			const cols = await stmt.columns();
			console.error(
				"[spacefn] prepared OK, cols:",
				cols.map((c: any) => c.name),
			);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[spacefn] validate error:", message);
		const ident = extractBadIdentifier(message);
		const range = (ident && rangeForIdentifier(doc, ident)) || {
			start: { line: 0, character: 0 },
			end: { line: 0, character: 1 },
		};
		diagnostics.push({
			severity: DiagnosticSeverity.Error,
			range,
			message,
			source: "spacefn",
		});
	}
	void connection.sendDiagnostics({ uri, diagnostics: diagnostics });
}

function extractBadIdentifier(message: string): string | null {
	const patterns = [
		/no such column: ["']?([A-Za-z_][A-Za-z0-9_]*)["']?/i,
		/column ["']([A-Za-z_][A-Za-z0-9_]*)["'] does not exist/i,
		/Unknown column ['"]([A-Za-z_][A-Za-z0-9_]*)['"]/i,
		/relation .* has no column named ["']?([A-Za-z_][A-Za-z0-9_]*)["']?/i,
		/no such table: ["']?([A-Za-z_][A-Za-z0-9_]*)["']?/i,
		/relation ["']?([A-Za-z_][A-Za-z0-9_]*)["']? does not exist/i,
	];
	for (const p of patterns) {
		const m = message.match(p);
		if (m) return m[1]!;
	}
	return null;
}

function rangeForIdentifier(doc: TextDocument, ident: string): Range | null {
	const text = doc.getText();
	const re = new RegExp("\\\\b" + ident + "\\\\b");
	const m = re.exec(text);
	if (!m) return null;
	const start = doc.positionAt(m.index);
	const end = doc.positionAt(m.index + ident.length);
	return { start, end };
}

function findDbDir(filePath: string): string | null {
	let dir = path.dirname(filePath);
	while (dir && dir !== path.parse(dir).root) {
		if (path.basename(dir) === "db") {
			return dir;
		}
		dir = path.dirname(dir);
	}
	return null;
}

async function validateEmbedded(doc: TextDocument): Promise<void> {
	const uri = doc.uri;
	const filePath = uri.startsWith("file://") ? decodeURIComponent(uri.replace("file://", "")) : uri;
	if (!filePath.endsWith(".ts") && !filePath.endsWith(".js")) return;
	const dbDir = findDbDir(filePath);
	if (!dbDir) return;
	let targetDb: string | null = null;
	try {
		const entries = await (
			await import("node:fs/promises")
		).readdir(dbDir, {
			withFileTypes: true,
		});
		const dbs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
		if (dbs.length > 0) targetDb = path.join(dbDir, dbs[0]!);
	} catch {
		return;
	}
	if (!targetDb) return;

	const text = doc.getText();
	const regex = /\b(?:sql|db)\s*`([\s\S]*?)`/g;
	const diagnostics: Diagnostic[] = [];
	let match: RegExpExecArray | null;
	let { dialect, migrations } = await loadDialectAndMigrations(targetDb);
	const scratch = await scratchDatabase(migrations, dialect);
	while ((match = regex.exec(text)) !== null) {
		const sql = match[1]!.replace(/\$\{[\s\S]*?\}/g, "NULL");
		const startOffset = match.index + match[0].indexOf("`") + 1;
		const startPos = doc.positionAt(startOffset);
		try {
			const stmt = await scratch.prepare(sql);
			await stmt.columns();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error("[spacefn] validateEmbedded error:", message);
			const ident = extractBadIdentifier(message);
			const range = (ident && rangeForIdentifier(doc, ident)) || {
				start: startPos,
				end: startPos,
			};
			diagnostics.push({
				severity: DiagnosticSeverity.Error,
				range,
				message,
				source: "spacefn",
			});
		}
	}
	void connection.sendDiagnostics({ uri, diagnostics });
}

interface ColumnInfo {
	name: string;
	type: string;
	notnull?: boolean;
	pk?: boolean;
	defaultValue?: string | null;
}
interface SchemaInfo {
	tables: string[];
	columns: Map<string, ColumnInfo[]>;
}

const schemaCache = new Map<string, SchemaInfo>();

async function getSchema(dbDir: string, targetDb: string): Promise<SchemaInfo> {
	const cached = schemaCache.get(targetDb);
	if (cached) return cached;
	const { dialect, migrations } = await loadDialectAndMigrations(targetDb);
	const scratch = await scratchDatabase(migrations, dialect);
	const tables = await scratch.tables();
	const columns = new Map<string, ColumnInfo[]>();
	for (const t of tables) {
		const info = await scratch.tableInfo(t);
		const mapped = info.map((c: any) => ({
			name: c.name,
			type: c.type,
			notnull: !!c.notnull,
			pk: !!c.pk,
			defaultValue: c.dflt_value ?? c.default_value ?? null,
		}));
		columns.set(t, mapped);
		columns.set(t.toLowerCase(), mapped);
	}
	const schema: SchemaInfo = { tables, columns };
	schemaCache.set(targetDb, schema);
	return schema;
}

function resolveDbDir(filePath: string): { dbDir: string; targetDb: string } | null {
	if (filePath.match(/[/\\]app[/\\]db[/\\][^/\\]+[/\\]queries[/\\]/)) {
		const dbDir = filePath.replace(/[/\\]queries[/\\].*/, "");
		return { dbDir, targetDb: dbDir };
	}
	const dbDir = findDbDir(filePath);
	if (!dbDir) return null;
	let targetDb: string | null = null;
	try {
		const { readdirSync, readFileSync } = require("node:fs");
		const entries = readdirSync(dbDir, { withFileTypes: true });
		const dbs = entries.filter((e: any) => e.isDirectory()).map((e: any) => e.name);
		let preferred: string | null = null;
		try {
			const content = readFileSync(filePath, "utf8");
			const m = content.match(/@space\/db\/([A-Za-z0-9_-]+)|@app\/db\/([A-Za-z0-9_-]+)/);
			if (m) preferred = m[1] || m[2];
		} catch {}
		if (preferred && dbs.includes(preferred)) {
			targetDb = path.join(dbDir, preferred);
		} else if (dbs.length === 1) {
			targetDb = path.join(dbDir, dbs[0]!);
		} else {
			return null;
		}
	} catch {
		return null;
	}
	if (!targetDb) return null;
	return { dbDir, targetDb };
}

documents.onDidChangeContent((change) => {
	console.error("[spacefn] didChange:", change.document.uri);
	if (change.document.uri.includes("/migrations/")) schemaCache.clear();
	if (change.document.uri.endsWith(".sql")) void validateSqlFile(change.document);
	else void validateEmbedded(change.document);
});
documents.onDidOpen((e) => {
	if (e.document.uri.endsWith(".sql")) void validateSqlFile(e.document);
	else void validateEmbedded(e.document);
});

const SQL_KEYWORDS = [
	"SELECT",
	"FROM",
	"WHERE",
	"JOIN",
	"INNER",
	"LEFT",
	"RIGHT",
	"FULL",
	"OUTER",
	"ON",
	"GROUP",
	"BY",
	"ORDER",
	"HAVING",
	"LIMIT",
	"OFFSET",
	"INSERT",
	"INTO",
	"VALUES",
	"UPDATE",
	"SET",
	"DELETE",
	"CREATE",
	"TABLE",
	"ALTER",
	"DROP",
	"INDEX",
	"PRIMARY",
	"KEY",
	"FOREIGN",
	"REFERENCES",
	"NOT",
	"NULL",
	"DEFAULT",
	"UNIQUE",
	"CHECK",
	"CONSTRAINT",
	"AS",
	"AND",
	"OR",
	"IN",
	"BETWEEN",
	"LIKE",
	"IS",
	"DISTINCT",
	"COUNT",
	"SUM",
	"AVG",
	"MIN",
	"MAX",
	"CASE",
	"WHEN",
	"THEN",
	"ELSE",
	"END",
	"EXISTS",
	"UNION",
	"ALL",
	"ASC",
	"DESC",
	"WITH",
	"RETURNING",
	"CASE",
	"WHEN",
	"THEN",
	"ELSE",
	"END",
	"CAST",
	"OVER",
	"PARTITION",
	"ROWS",
	"RANGE",
	"UNBOUNDED",
	"PRECEDING",
	"FOLLOWING",
	"CURRENT",
	"ROW",
	"ROWS",
	"EXISTS",
	"TRUE",
	"FALSE",
	"NULL",
	"IS",
	"ILIKE",
	"GLOB",
	"REGEXP",
	"MATCH",
	"ESCAPE",
	"COLLATE",
	"CONFLICT",
	"DO",
	"NOTHING",
	"EXCLUDED",
	"ON",
	"USING",
	"NATURAL",
	"CROSS",
	"RECURSIVE",
	"MATERIALIZED",
	"LATERAL",
	"WINDOW",
	"FILTER",
	"WITHIN",
	"GROUP",
	"ORDER",
	"BY",
	"ASC",
	"DESC",
	"NULLS",
	"FIRST",
	"LAST",
	"FETCH",
	"NEXT",
	"ONLY",
	"TIES",
	"FOR",
	"UPDATE",
	"SHARE",
	"NOWAIT",
	"SKIP",
	"LOCKED",
];

const SQL_FUNCTIONS = [
	"COUNT",
	"SUM",
	"AVG",
	"MIN",
	"MAX",
	"TOTAL",
	"COALESCE",
	"NULLIF",
	"IFNULL",
	"IIF",
	"CAST",
	"TYPEOF",
	"LENGTH",
	"SUBSTR",
	"SUBSTRING",
	"UPPER",
	"LOWER",
	"TRIM",
	"LTRIM",
	"RTRIM",
	"REPLACE",
	"INSTR",
	"PRINTF",
	"FORMAT",
	"ABS",
	"ROUND",
	"CEIL",
	"FLOOR",
	"RANDOM",
	"DATE",
	"TIME",
	"DATETIME",
	"JULIANDAY",
	"STRFTIME",
	"ROW_NUMBER",
	"RANK",
	"DENSE_RANK",
	"NTILE",
	"LAG",
	"LEAD",
	"FIRST_VALUE",
	"LAST_VALUE",
	"NTH_VALUE",
	"OVER",
	"PARTITION",
	"GROUP_CONCAT",
	"JSON",
	"JSON_EXTRACT",
	"JSON_ARRAY",
	"JSON_OBJECT",
	"JSON_GROUP_ARRAY",
];

const parser = new Parser();

const htmlLS = htmlService.getLanguageService();

// DataStar attribute provider
const datastarProvider = htmlService.newHTMLDataProvider("datastar", {
	version: 1,
	tags: [],
	globalAttributes: [
		// data-on: event handlers
		...[
			"click",
			"dblclick",
			"mousedown",
			"mouseup",
			"mouseover",
			"mouseout",
			"mousemove",
			"mouseenter",
			"mouseleave",
			"keydown",
			"keyup",
			"keypress",
			"focus",
			"blur",
			"focusin",
			"focusout",
			"input",
			"change",
			"submit",
			"reset",
			"scroll",
			"resize",
			"wheel",
			"touchstart",
			"touchend",
			"touchmove",
			"pointerdown",
			"pointerup",
			"pointermove",
			"pointerenter",
			"pointerleave",
			"contextmenu",
			"drag",
			"dragstart",
			"dragend",
			"dragover",
			"dragenter",
			"dragleave",
			"drop",
			"copy",
			"cut",
			"paste",
			"select",
			"invalid",
			"search",
			"toggle",
			"playing",
			"pause",
			"ended",
			"loadeddata",
			"canplay",
			"progress",
			"durationchange",
			"ratechange",
			"volumechange",
			"timeupdate",
			"waiting",
			"playing",
			"canplaythrough",
			"emptied",
			"abort",
			"error",
			"load",
			"unload",
			"beforeunload",
			"hashchange",
			"popstate",
			"storage",
			"online",
			"offline",
			"message",
			"open",
			"close",
			"send",
			"error",
		].map((e) => ({
			name: `data-on:${e}`,
			description: `DataStar event handler for ${e}`,
		})),
		// data-on:* special plugins
		{ name: "data-on-intersect", description: "DataStar intersection observer" },
		{ name: "data-on-interval", description: "DataStar interval handler" },
		{ name: "data-on-raf", description: "DataStar requestAnimationFrame handler" },
		{ name: "data-on-resize", description: "DataStar resize handler" },
		{ name: "data-on-signal-patch", description: "DataStar signal patch handler" },
		{ name: "data-on-signal-patch-filter", description: "DataStar signal patch filter" },
		// data-attr
		{ name: "data-attr", description: "DataStar attribute binding" },
		// data-bind
		{ name: "data-bind", description: "DataStar two-way binding" },
		// data-class
		{ name: "data-class", description: "DataStar class binding" },
		// data-computed
		{ name: "data-computed", description: "DataStar computed signal" },
		// data-custom-validity
		{ name: "data-custom-validity", description: "DataStar custom validity" },
		// data-effect
		{ name: "data-effect", description: "DataStar effect" },
		// data-ignore
		{ name: "data-ignore", description: "DataStar ignore" },
		{ name: "data-ignore-morph", description: "DataStar ignore morph" },
		// data-indicator
		{ name: "data-indicator", description: "DataStar loading indicator" },
		// data-init
		{ name: "data-init", description: "DataStar init" },
		// data-json-signals
		{ name: "data-json-signals", description: "DataStar JSON signals" },
		// data-match-media
		{ name: "data-match-media", description: "DataStar match media" },
		// data-nonce
		{ name: "data-nonce", description: "DataStar nonce" },
		// data-persist
		{ name: "data-persist", description: "DataStar persist" },
		// data-preserve-attr
		{ name: "data-preserve-attr", description: "DataStar preserve attr" },
		// data-query-string
		{ name: "data-query-string", description: "DataStar query string" },
		// data-ref
		{ name: "data-ref", description: "DataStar element reference" },
		// data-replace-url
		{ name: "data-replace-url", description: "DataStar replace URL" },
		// data-scroll-into-view
		{ name: "data-scroll-into-view", description: "DataStar scroll into view" },
		// data-show
		{ name: "data-show", description: "DataStar conditional show" },
		// data-signals
		{ name: "data-signals", description: "DataStar signals" },
		// data-style
		{ name: "data-style", description: "DataStar style binding" },
		// data-text
		{ name: "data-text", description: "DataStar text binding" },
		// data-view-transition
		{ name: "data-view-transition", description: "DataStar view transition" },
		// Modifiers
		...[
			"once",
			"passive",
			"capture",
			"case",
			"delay",
			"debounce",
			"throttle",
			"viewtransition",
			"window",
			"document",
			"outside",
			"prevent",
			"stop",
			"duration",
			"exit",
			"half",
			"full",
			"threshold",
			"leading",
			"notrailing",
			"noleading",
			"trailing",
			"self",
		].map((m) => ({
			name: `__${m}`,
			description: `DataStar modifier: ${m}`,
		})),
		// Modifier arguments
		...["camel", "kebab", "snake", "pascal", "leading", "notrailing", "trailing", "noleading"].map(
			(a) => ({
				name: `.${a}`,
				description: `DataStar modifier arg: ${a}`,
			}),
		),
		// Timing arguments
		...["500ms", "100ms", "1s", "2s", "300ms", "750ms", "1000ms"].map((t) => ({
			name: `.${t}`,
			description: `DataStar timing: ${t}`,
		})),
		// Threshold arguments
		...["0.25", "0.5", "0.75", "0.1", "0.9"].map((t) => ({
			name: `.${t}`,
			description: `DataStar threshold: ${t}`,
		})),
	],
});
htmlLS.setDataProviders(true, [datastarProvider, htmlService.getDefaultHTMLDataProvider()]);

type CompletionContext =
	| { kind: "table" }
	| { kind: "column"; tables: string[] }
	| { kind: "keyword" };

function inSqlString(text: string, offset: number): boolean {
	// crude: walk back to find an unclosed quote/backtick
	let i = offset - 1;
	let quote: string | null = null;
	while (i >= 0) {
		const ch = text[i];
		if (ch === "`" || ch === '"' || ch === "'") {
			// count consecutive backslashes
			let bs = 0;
			let j = i - 1;
			while (j >= 0 && text[j] === "\\") {
				bs++;
				j--;
			}
			if (bs % 2 === 0) {
				quote = ch;
				break;
			}
		}
		i--;
	}
	if (!quote) return false;
	// ensure there's a closing quote after offset
	const close = text.indexOf(quote, offset);
	return close !== -1;
}

function findHtmlTemplateRange(
	text: string,
	offset: number,
): { start: number; end: number; contentStart: number } | null {
	// find the nearest html` before offset
	const re = /\bhtml\s*`/g;
	let m: RegExpExecArray | null;
	let last: RegExpExecArray | null = null;
	while ((m = re.exec(text)) !== null) {
		if (m.index < offset) last = m;
		else break;
	}
	if (!last) return null;
	const contentStart = last.index + last[0].length;
	// find closing backtick
	let i = contentStart;
	let depth = 0;
	while (i < text.length) {
		const ch = text[i];
		if (ch === "`" && depth === 0) {
			// ensure not escaped
			if (i > 0 && text[i - 1] === "\\") {
				i++;
				continue;
			}
			return { start: last.index, end: i, contentStart };
		}
		if (ch === "$" && text[i + 1] === "{") {
			// skip ${...} by tracking braces
			let d = 1;
			i += 2;
			while (i < text.length && d > 0) {
				if (text[i] === "{") d++;
				else if (text[i] === "}") d--;
				i++;
			}
			continue;
		}
		i++;
	}
	return null;
}

function detectContext(before: string, fullText: string): CompletionContext {
	// table context: last keyword before cursor is a table-introducing keyword
	if (/\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+\w*$/i.test(before)) return { kind: "table" };
	// column context after dot
	const dot = before.match(/(\w+)\.\s*\w*$/);
	if (dot) return { kind: "column", tables: [dot[1]!] };
	// column context: after SELECT/WHERE/ON/GROUP/ORDER/HAVING/SET
	if (
		/\b(SELECT|WHERE|ON|GROUP\s+BY|ORDER\s+BY|HAVING|SET)\s+[\w,\s]*$/i.test(before) &&
		!/\b(FROM|JOIN)\s+\w*$/i.test(before)
	) {
		// try to extract tables from FROM clause in the statement
		const tables = extractTables(fullText);
		if (tables.length) return { kind: "column", tables };
	}
	return { kind: "keyword" };
}

function resolveAliases(sql: string): Map<string, string> {
	const m = new Map<string, string>();
	try {
		const ast = parser.astify(sql + " ", { database: "sqlite" }) as any;
		const node = Array.isArray(ast) ? ast[0] : ast;
		const from = node?.from;
		if (Array.isArray(from)) {
			for (const n of from) {
				if (n && typeof n.table === "string") {
					m.set(n.table, n.table);
					if (typeof n.as === "string" && n.as) m.set(n.as, n.table);
				}
			}
		}
	} catch {
		// ignore
	}
	return m;
}

function extractTables(sql: string): string[] {
	try {
		const ast = parser.astify(sql + " ", { database: "sqlite" }) as any;
		const tables = new Set<string>();
		const walk = (node: any) => {
			if (!node || typeof node !== "object") return;
			if (node.table && typeof node.table === "string") tables.add(node.table);
			for (const k of Object.keys(node)) {
				const v = node[k];
				if (Array.isArray(v)) v.forEach(walk);
				else if (v && typeof v === "object") walk(v);
			}
		};
		walk(ast);
		return [...tables];
	} catch {
		// fallback regex
		const m = sql.match(/\bFROM\s+(\w+)/gi);
		return m ? m.map((x) => x.replace(/\bFROM\s+/i, "")) : [];
	}
}

connection.onCompletion(async (params) => {
	console.error("[spacefn] onCompletion CALLED");
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return null;
	const filePath = params.textDocument.uri.startsWith("file://")
		? decodeURIComponent(params.textDocument.uri.replace("file://", ""))
		: params.textDocument.uri;
	const isJsTs =
		filePath.endsWith(".js") ||
		filePath.endsWith(".ts") ||
		filePath.endsWith(".jsx") ||
		filePath.endsWith(".tsx");
	const offset = doc.offsetAt(params.position);
	const text = doc.getText();
	const tpl = isJsTs ? findHtmlTemplateRange(text, offset) : null;
	console.error("[spacefn] onCompletion isJsTs:", isJsTs, "tpl:", !!tpl);
	if (tpl && offset >= tpl.contentStart && offset <= tpl.end) {
		// build HTML document with placeholders for ${...}
		let htmlText = text.slice(tpl.contentStart, tpl.end);
		// replace ${...} with spaces to keep offsets
		let masked = "";
		let i = 0;
		while (i < htmlText.length) {
			if (htmlText[i] === "$" && htmlText[i + 1] === "{") {
				let d = 1;
				let j = i + 2;
				while (j < htmlText.length && d > 0) {
					if (htmlText[j] === "{") d++;
					else if (htmlText[j] === "}") d--;
					j++;
				}
				masked += " ".repeat(j - i);
				i = j;
			} else {
				masked += htmlText[i];
				i++;
			}
		}
		const htmlDoc = htmlService.TextDocument.create("file:///embedded.html", "html", 1, masked);
		const pos = htmlDoc.positionAt(offset - tpl.contentStart);
		const htmlDocParsed = htmlLS.parseHTMLDocument(htmlDoc);
		const list = htmlLS.doComplete(htmlDoc, pos, htmlDocParsed);
		if (!list) return null;
		const adjusted = list.items.map((item: any) => {
			if (item.textEdit && item.textEdit.range) {
				item.textEdit.range = {
					start: doc.positionAt(tpl.contentStart + htmlDoc.offsetAt(item.textEdit.range.start)),
					end: doc.positionAt(tpl.contentStart + htmlDoc.offsetAt(item.textEdit.range.end)),
				};
			}
			return item;
		});
		// dedup by label
		const seen = new Set<string>();
		const deduped = adjusted.filter((item: any) => {
			if (seen.has(item.label)) return false;
			seen.add(item.label);
			return true;
		});
		return deduped;
	}
	const isSqlFile = filePath.endsWith(".sql");
	if (!isSqlFile && !inSqlString(text, offset)) return null;
	const resolved = resolveDbDir(filePath);
	if (!resolved) return null;
	let schema: SchemaInfo;
	try {
		schema = await getSchema(resolved.dbDir, resolved.targetDb);
	} catch {
		return null;
	}
	const before = text.slice(0, offset);
	const items: CompletionItem[] = [];
	const aliasMap = resolveAliases(text);
	const ctx = detectContext(before, text);
	const prefix = (before.match(/(\w*)$/) || ["", ""])[1]!.toLowerCase();

	if (ctx.kind === "table") {
		for (const t of schema.tables) {
			if (t.toLowerCase().startsWith(prefix))
				items.push({ label: t, kind: CompletionItemKind.Class });
		}
		return items;
	}

	if (ctx.kind === "column") {
		// only suggest columns when at least one table is in scope;
		// otherwise we'd leak columns from unrelated tables
		if (!ctx.tables.length) return [];
		const tables = ctx.tables.map((t) => aliasMap.get(t) ?? t);
		const seen = new Set<string>();
		for (const t of tables) {
			const cols = schema.columns.get(t) ?? schema.columns.get(t.toLowerCase()) ?? [];
			for (const c of cols) {
				if (c.name.toLowerCase().startsWith(prefix) && !seen.has(c.name)) {
					seen.add(c.name);
					items.push({ label: c.name, kind: CompletionItemKind.Field, detail: c.type });
				}
			}
		}
		return items;
	}

	for (const f of SQL_FUNCTIONS) {
		if (f.toLowerCase().startsWith(prefix))
			items.push({
				label: f,
				kind: CompletionItemKind.Function,
				insertText: f + "($1)",
				insertTextFormat: 2,
			});
	}
	for (const k of SQL_KEYWORDS) {
		if (k.toLowerCase().startsWith(prefix))
			items.push({ label: k, kind: CompletionItemKind.Keyword });
	}
	for (const t of schema.tables) {
		if (t.toLowerCase().startsWith(prefix))
			items.push({ label: t, kind: CompletionItemKind.Class });
	}
	return items;
});

connection.onHover(async (params): Promise<Hover | null> => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return null;
	const filePath = params.textDocument.uri.startsWith("file://")
		? decodeURIComponent(params.textDocument.uri.replace("file://", ""))
		: params.textDocument.uri;
	const isJsTs =
		filePath.endsWith(".js") ||
		filePath.endsWith(".ts") ||
		filePath.endsWith(".jsx") ||
		filePath.endsWith(".tsx");
	const offset = doc.offsetAt(params.position);
	const text = doc.getText();
	const tpl = isJsTs ? findHtmlTemplateRange(text, offset) : null;
	if (tpl && offset >= tpl.contentStart && offset <= tpl.end) {
		let htmlText = text.slice(tpl.contentStart, tpl.end);
		let masked = "";
		let i = 0;
		while (i < htmlText.length) {
			if (htmlText[i] === "$" && htmlText[i + 1] === "{") {
				let d = 1;
				let j = i + 2;
				while (j < htmlText.length && d > 0) {
					if (htmlText[j] === "{") d++;
					else if (htmlText[j] === "}") d--;
					j++;
				}
				masked += " ".repeat(j - i);
				i = j;
			} else {
				masked += htmlText[i];
				i++;
			}
		}
		const htmlDoc = htmlService.TextDocument.create("file:///embedded.html", "html", 1, masked);
		const pos = htmlDoc.positionAt(offset - tpl.contentStart);
		const htmlDocParsed = htmlLS.parseHTMLDocument(htmlDoc);
		const hover = htmlLS.doHover(htmlDoc, pos, htmlDocParsed);
		return hover as any;
	}
	const isSqlFile = filePath.endsWith(".sql");
	if (!isSqlFile && !inSqlString(text, offset)) return null;
	const resolved = resolveDbDir(filePath);
	if (!resolved) return null;
	let schema: SchemaInfo;
	try {
		schema = await getSchema(resolved.dbDir, resolved.targetDb);
	} catch {
		return null;
	}
	const wordRange = wordRangeAt(doc, params.position, /[A-Za-z_][A-Za-z0-9_]*/);
	if (!wordRange) return null;
	const word = doc.getText(wordRange);
	const aliasMap = resolveAliases(doc.getText());
	const baseTable = aliasMap.get(word) ?? word;
	// table?
	if (schema.tables.includes(baseTable)) {
		const cols = schema.columns.get(baseTable) ?? [];
		const colList = cols
			.map((c) => `${c.pk ? "🔑 " : ""}${c.name} (${c.type}${c.notnull ? ", NN" : ""})`)
			.join(", ");
		return {
			contents: {
				kind: "markdown",
				value: `**table** \`${baseTable}\`\n\nColumns: ${colList}`,
			},
			range: wordRange,
		};
	}
	// column?
	for (const [t, cols] of schema.columns) {
		const col = cols.find((c) => c.name === word);
		if (col) {
			const flags = [col.pk ? "PK" : "", col.notnull ? "NOT NULL" : "nullable"]
				.filter(Boolean)
				.join(" · ");
			const def = col.defaultValue != null ? ` · DEFAULT ${col.defaultValue}` : "";
			return {
				contents: {
					kind: "markdown",
					value: `**column** \`${col.name}\` : ${col.type} · ${flags}${def} (table ${t})`,
				},
				range: wordRange,
			};
		}
	}
	return null;
});

connection.onDefinition(async (params): Promise<Location[] | null> => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return null;
	const filePath = params.textDocument.uri.startsWith("file://")
		? decodeURIComponent(params.textDocument.uri.replace("file://", ""))
		: params.textDocument.uri;
	const isSqlFile = filePath.endsWith(".sql");
	const offset = doc.offsetAt(params.position);
	if (!isSqlFile && !inSqlString(doc.getText(), offset)) return null;
	const resolved = resolveDbDir(filePath);
	if (!resolved) return null;
	const wordRange = wordRangeAt(doc, params.position, /[A-Za-z_][A-Za-z0-9_]*/);
	if (!wordRange) return null;
	const word = doc.getText(wordRange);
	const aliasMap = resolveAliases(doc.getText());
	const target = aliasMap.get(word) ?? word;

	// resolve column -> owning table (if applicable)
	let ownerTable: string | null = null;
	try {
		const schema = await getSchema(resolved.dbDir, resolved.targetDb);
		for (const [t, cols] of schema.columns) {
			if (cols.some((c) => c.name === word)) {
				ownerTable = t;
				break;
			}
		}
	} catch {
		// ignore
	}
	const searchName = ownerTable ?? target;

	const migrationsDir = path.join(resolved.targetDb, "migrations");
	let files: string[] = [];
	try {
		files = await fs.readdir(migrationsDir);
	} catch {
		return null;
	}
	for (const f of files) {
		if (!f.endsWith(".sql")) continue;
		const full = path.join(migrationsDir, f);
		const content = await fs.readFile(full, "utf8");
		const re = new RegExp(
			`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["'\`]?${searchName}["'\`]?`,
			"i",
		);
		const m = content.match(re);
		if (m && m.index !== undefined) {
			// if looking for a column, find its line within the CREATE TABLE block
			let idx = m.index;
			if (ownerTable && ownerTable.toLowerCase() !== target.toLowerCase()) {
				// target was a column name; locate column within table block
				const start = m.index;
				const endIdx = content.indexOf(";", start);
				const block = content.slice(start, endIdx === -1 ? undefined : endIdx);
				const colRe = new RegExp(`\\b${target}\\b`, "i");
				const cm = block.match(colRe);
				if (cm && cm.index !== undefined) idx = start + cm.index;
			} else if (ownerTable) {
				const start = m.index;
				const endIdx = content.indexOf(";", start);
				const block = content.slice(start, endIdx === -1 ? undefined : endIdx);
				const colRe = new RegExp(`\\b${target}\\b`, "i");
				const cm = block.match(colRe);
				if (cm && cm.index !== undefined) idx = start + cm.index;
			}
			const pos = offsetToPosition(content, idx);
			return [
				{
					uri: `file://${full}`,
					range: { start: pos, end: pos },
				},
			];
		}
	}
	return null;
});

function wordRangeAt(
	doc: TextDocument,
	position: Position,
	regex: RegExp,
): { start: Position; end: Position } | null {
	const text = doc.getText();
	const offset = doc.offsetAt(position);
	// expand left
	let start = offset;
	while (start > 0 && regex.test(text[start - 1]!)) start--;
	regex.lastIndex = 0;
	let end = offset;
	while (end < text.length && regex.test(text[end]!)) end++;
	regex.lastIndex = 0;
	if (start === end) return null;
	return { start: doc.positionAt(start), end: doc.positionAt(end) };
}

function offsetToPosition(text: string, offset: number): Position {
	const before = text.slice(0, offset);
	const lines = before.split("\n");
	return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

connection.onInitialized(async () => {
	try {
		await connection.client.register(DidChangeWatchedFilesNotification.type, {
			watchers: [{ globPattern: "**/migrations/*" }],
		});
	} catch {
		// ignore
	}
});

connection.onDidChangeWatchedFiles(() => {
	schemaCache.clear();
	for (const doc of documents.all()) {
		if (doc.uri.endsWith(".sql")) void validateSqlFile(doc);
		else void validateEmbedded(doc);
	}
});

connection.onInitialize(() => ({
	capabilities: {
		textDocumentSync: 1,
		completionProvider: { triggerCharacters: ["<", "/", " ", "=", '"', "'", ":", "-"] },
		hoverProvider: true,
		definitionProvider: true,
	},
}));

documents.listen(connection);
connection.listen();
