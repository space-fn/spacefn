import * as fs from "node:fs/promises";
import * as path from "node:path";

import { Parser } from "node-sql-parser";
import { scanMigrations, analyzeQueries, scratchDatabase } from "spacefn/db";
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
	const m = filePath.match(/[/\\]app[/\\]db[/\\]([^/\\]+)[/\\]queries[/\\]/);
	if (!m) return;
	const dbDir = filePath.replace(/[/\\]queries[/\\].*/, "");
	const queriesDir = path.join(dbDir, "queries");
	const diagnostics: Diagnostic[] = [];
	try {
		const { dialect, migrations } = await loadDialectAndMigrations(dbDir);
		await analyzeQueries(queriesDir, migrations, dialect);
	} catch (err) {
		diagnostics.push({
			severity: DiagnosticSeverity.Error,
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
			message: err instanceof Error ? err.message : String(err),
			source: "spacefn",
		});
	}
	void connection.sendDiagnostics({ uri, diagnostics: diagnostics });
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
			diagnostics.push({
				severity: DiagnosticSeverity.Error,
				range: { start: startPos, end: startPos },
				message: err instanceof Error ? err.message : String(err),
				source: "spacefn",
			});
		}
	}
	void connection.sendDiagnostics({ uri, diagnostics });
}

interface SchemaInfo {
	tables: string[];
	columns: Map<string, { name: string; type: string }[]>;
}

const schemaCache = new Map<string, SchemaInfo>();

async function getSchema(dbDir: string, targetDb: string): Promise<SchemaInfo> {
	const cached = schemaCache.get(targetDb);
	if (cached) return cached;
	const { dialect, migrations } = await loadDialectAndMigrations(targetDb);
	const scratch = await scratchDatabase(migrations, dialect);
	const tables = await scratch.tables();
	const columns = new Map<string, { name: string; type: string }[]>();
	for (const t of tables) {
		const info = await scratch.tableInfo(t);
		columns.set(
			t,
			info.map((c) => ({ name: c.name, type: c.type })),
		);
		columns.set(
			t.toLowerCase(),
			info.map((c) => ({ name: c.name, type: c.type })),
		);
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
];

const parser = new Parser();

type CompletionContext =
	| { kind: "table" }
	| { kind: "column"; tables: string[] }
	| { kind: "keyword" };

function detectContext(before: string): CompletionContext {
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
		const tables = extractTables(before);
		return { kind: "column", tables };
	}
	return { kind: "keyword" };
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
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return null;
	const filePath = params.textDocument.uri.startsWith("file://")
		? decodeURIComponent(params.textDocument.uri.replace("file://", ""))
		: params.textDocument.uri;
	const resolved = resolveDbDir(filePath);
	if (!resolved) return null;
	let schema: SchemaInfo;
	try {
		schema = await getSchema(resolved.dbDir, resolved.targetDb);
	} catch {
		return null;
	}
	const text = doc.getText();
	const offset = doc.offsetAt(params.position);
	const before = text.slice(0, offset);
	const items: CompletionItem[] = [];
	const ctx = detectContext(before);
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
		const tables = ctx.tables;
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
	// table?
	if (schema.tables.includes(word)) {
		const cols = schema.columns.get(word) ?? [];
		return {
			contents: {
				kind: "markdown",
				value: `**table** \`${word}\`\n\nColumns: ${cols.map((c) => c.name).join(", ")}`,
			},
			range: wordRange,
		};
	}
	// column?
	for (const [t, cols] of schema.columns) {
		const col = cols.find((c) => c.name === word);
		if (col) {
			return {
				contents: {
					kind: "markdown",
					value: `**column** \`${col.name}\` : ${col.type} (table ${t})`,
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
	const resolved = resolveDbDir(filePath);
	if (!resolved) return null;
	const wordRange = wordRangeAt(doc, params.position, /[A-Za-z_][A-Za-z0-9_]*/);
	if (!wordRange) return null;
	const word = doc.getText(wordRange);
	// search migrations for CREATE TABLE <word>
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
			`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["'\`]?${word}["'\`]?`,
			"i",
		);
		if (re.test(content)) {
			const idx = content.search(re);
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
});

connection.onInitialize(() => ({
	capabilities: {
		textDocumentSync: 1,
		completionProvider: { triggerCharacters: [".", " "] },
		hoverProvider: true,
		definitionProvider: true,
	},
}));

connection.listen();
documents.listen(connection);
