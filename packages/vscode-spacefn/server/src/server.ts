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

// Validate DataStar attribute syntax
async function validateDatastarAttributes(
	doc: TextDocument,
	htmlText: string,
	contentStart: number,
): Promise<any[]> {
	const diagnostics: any[] = [];

	// Check for invalid attribute syntax
	const attrRe = /data-([a-z-]+)(?::([a-zA-Z0-9_-]+))?(__[a-z]+(?:\.[a-z0-9]+)*)?(?:="([^"]*)")?/g;
	let m;
	const validPlugins = [
		"on",
		"attr",
		"bind",
		"class",
		"computed",
		"effect",
		"ignore",
		"ignore-morph",
		"indicator",
		"init",
		"json-signals",
		"on-intersect",
		"on-interval",
		"on-raf",
		"on-resize",
		"on-signal-patch",
		"on-signal-patch-filter",
		"preserve-attr",
		"ref",
		"show",
		"signals",
		"style",
		"text",
		"animate",
		"custom-validity",
		"match-media",
		"persist",
		"query-string",
		"replace-url",
		"scroll-into-view",
		"view-transition",
		"nonce",
	];

	while ((m = attrRe.exec(htmlText)) !== null) {
		const plugin = m[1];
		const modifiers = m[3];

		// Validate plugin name
		if (!validPlugins.includes(plugin)) {
			const range = {
				start: doc.positionAt(contentStart + m.index),
				end: doc.positionAt(contentStart + m.index + m[0].length),
			};
			diagnostics.push({
				severity: 2,
				range,
				message: `Unknown DataStar plugin: "${plugin}". Valid plugins: ${validPlugins.join(", ")}`,
				source: "spacefn-datastar",
			});
		}

		// Validate modifier syntax
		if (modifiers) {
			const modParts = modifiers.split("__").filter(Boolean);
			const validModifiers = [
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
				"terse",
				"session",
				"filter",
				"history",
				"smooth",
				"instant",
				"auto",
				"hstart",
				"hcenter",
				"hend",
				"hnearest",
				"vstart",
				"vcenter",
				"vend",
				"vnearest",
				"focus",
				"ifmissing",
				"prop",
				"event",
			];
			for (const mod of modParts) {
				const modName = mod.split(".")[0];
				if (!validModifiers.includes(modName)) {
					const modStart = contentStart + m.index + m[0].indexOf(mod);
					const range = {
						start: doc.positionAt(modStart),
						end: doc.positionAt(modStart + mod.length),
					};
					diagnostics.push({
						severity: 2,
						range,
						message: `Unknown DataStar modifier: "${modName}". Valid modifiers: ${validModifiers.join(", ")}`,
						source: "spacefn-datastar",
					});
				}
			}
		}
	}

	return diagnostics;
}

async function validateHtmlDatastar(doc: TextDocument): Promise<void> {
	const uri = doc.uri;
	const text = doc.getText();
	const diagnostics: any[] = [];
	const re = /\bhtml\s*`/g;
	let m;
	while ((m = re.exec(text)) !== null) {
		const contentStart = m.index + m[0].length;
		let i = contentStart;
		let depth = 0;
		let end = -1;
		while (i < text.length) {
			const ch = text[i];
			if (ch === "`" && depth === 0) {
				end = i;
				break;
			}
			if (ch === "$" && text[i + 1] === "{") {
				let d = 1;
				let j = i + 2;
				while (j < text.length && d > 0) {
					if (text[j] === "{") d++;
					else if (text[j] === "}") d--;
					j++;
				}
				i = j;
				continue;
			}
			i++;
		}
		if (end === -1) break;
		const htmlText = text.slice(contentStart, end);
		const htmlDiags = await validateDatastarAttributes(doc, htmlText, contentStart);
		diagnostics.push(...htmlDiags);
		re.lastIndex = end + 1;
	}
	void connection.sendDiagnostics({ uri, diagnostics });
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
	else if (
		change.document.uri.endsWith(".js") ||
		change.document.uri.endsWith(".ts") ||
		change.document.uri.endsWith(".jsx") ||
		change.document.uri.endsWith(".tsx")
	)
		void validateHtmlDatastar(change.document);
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
		// ===== data-on: event handlers =====
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
		].map((e) => ({
			name: `data-on:${e}`,
			description: `Attaches an event listener for ${e}. Executes expression on trigger.`,
		})),
		// ===== data-on special plugins =====
		{
			name: "data-on-intersect",
			description:
				"Runs expression when element intersects viewport. Modifiers: __once, __exit, __half, __full, __threshold",
		},
		{
			name: "data-on-interval",
			description: "Runs expression at regular interval. Modifiers: __duration",
		},
		{
			name: "data-on-raf",
			description: "[Pro] Runs expression on requestAnimationFrame. Modifiers: __throttle",
		},
		{
			name: "data-on-resize",
			description: "[Pro] Runs expression on element resize. Modifiers: __debounce, __throttle",
		},
		{
			name: "data-on-signal-patch",
			description:
				"Runs expression when signals change. Modifiers: __delay, __debounce, __throttle",
		},
		{
			name: "data-on-signal-patch-filter",
			description: "Filters which signals to watch for data-on-signal-patch",
		},
		// ===== Core attributes =====
		{
			name: "data-attr",
			description:
				"Sets HTML attribute value from expression and keeps in sync. Key: attribute name. Value: expression or object",
		},
		{
			name: "data-bind",
			description:
				"Two-way data binding between signal and element value. Key: signal name. Modifiers: __case, __prop, __event",
		},
		{
			name: "data-class",
			description:
				"Adds/removes class based on expression. Key: class name. Value: expression or object. Modifiers: __case",
		},
		{
			name: "data-computed",
			description: "Creates computed signal from expression. Key: signal name. Modifiers: __case",
		},
		{ name: "data-effect", description: "Runs expression on load and when signals change" },
		{
			name: "data-ignore",
			description: "Tells DataStar to skip this element and descendants. Modifiers: __self",
		},
		{
			name: "data-ignore-morph",
			description: "Tells PatchElements to skip this element when morphing",
		},
		{
			name: "data-indicator",
			description:
				"Creates signal that is true during fetch requests. Key: signal name. Modifiers: __case",
		},
		{
			name: "data-init",
			description:
				"Runs expression when attribute is initialized. Modifiers: __delay, __viewtransition",
		},
		{
			name: "data-json-signals",
			description: "Displays reactive JSON of signals. Value: filter object. Modifiers: __terse",
		},
		{
			name: "data-on",
			description:
				"Attaches event listener. Key: event name. Modifiers: __once, __passive, __capture, __case, __delay, __debounce, __throttle, __viewtransition, __window, __document, __outside, __prevent, __stop",
		},
		{
			name: "data-preserve-attr",
			description:
				"Preserves attribute value when morphing. Value: space-separated attribute names",
		},
		{
			name: "data-ref",
			description:
				"Creates signal that references the element. Key: signal name. Modifiers: __case",
		},
		{ name: "data-show", description: "Shows/hides element based on expression" },
		{
			name: "data-signals",
			description:
				"Patches signals. Key: signal name. Value: expression or object. Modifiers: __case, __ifmissing",
		},
		{
			name: "data-style",
			description:
				"Sets inline CSS style from expression. Key: CSS property. Value: expression or object",
		},
		{ name: "data-text", description: "Binds text content to expression" },
		// ===== Pro attributes =====
		{ name: "data-animate", description: "[Pro] Animates element attributes over time" },
		{
			name: "data-custom-validity",
			description: "[Pro] Adds custom validity to element. Value: expression returning string",
		},
		{
			name: "data-match-media",
			description:
				"[Pro] Sets signal to media query match state. Key: signal name. Modifiers: __case",
		},
		{
			name: "data-persist",
			description:
				"[Pro] Persists signals to local/session storage. Key: storage key. Modifiers: __session",
		},
		{
			name: "data-query-string",
			description:
				"[Pro] Syncs signals to query string params. Value: filter object. Modifiers: __filter, __history",
		},
		{
			name: "data-replace-url",
			description: "[Pro] Replaces browser URL. Value: expression returning URL string",
		},
		{
			name: "data-scroll-into-view",
			description:
				"[Pro] Scrolls element into view. Modifiers: __smooth, __instant, __auto, __hstart, __hcenter, __hend, __hnearest, __vstart, __vcenter, __vend, __vnearest, __focus",
		},
		{
			name: "data-view-transition",
			description: "[Pro] Sets view-transition-name style. Value: expression",
		},
		// ===== Modifiers =====
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
			"terse",
			"session",
			"filter",
			"history",
			"smooth",
			"instant",
			"auto",
			"hstart",
			"hcenter",
			"hend",
			"hnearest",
			"vstart",
			"vcenter",
			"vend",
			"vnearest",
			"focus",
			"ifmissing",
			"prop",
			"event",
		].map((m) => ({
			name: `__${m}`,
			description: `DataStar modifier: ${m}`,
		})),
		// ===== Modifier arguments =====
		...["camel", "kebab", "snake", "pascal"].map((a) => ({
			name: `.${a}`,
			description: `Case modifier: ${a}`,
		})),
		...["leading", "notrailing", "trailing", "noleading"].map((a) => ({
			name: `.${a}`,
			description: `Timing modifier: ${a}`,
		})),
		...["500ms", "100ms", "1s", "2s", "300ms", "750ms", "1000ms"].map((t) => ({
			name: `.${t}`,
			description: `Timing: ${t}`,
		})),
		...["0.25", "0.5", "0.75", "0.1", "0.9"].map((t) => ({
			name: `.${t}`,
			description: `Threshold: ${t}`,
		})),
	],
});

// Action completion for @action() calls in expressions
const datastarActions = htmlService.newHTMLDataProvider("datastar-actions", {
	version: 1,
	tags: [],
	globalAttributes: [
		{
			name: "@peek",
			description: "Access signals without subscribing to changes. @peek(() => $signal)",
		},
		{ name: "@setAll", description: "Set value of matching signals. @setAll(value, filter?)" },
		{
			name: "@toggleAll",
			description: "Toggle boolean value of matching signals. @toggleAll(filter?)",
		},
		{ name: "@get", description: "Send GET request. @get(uri, options?)" },
		{ name: "@post", description: "Send POST request. @post(uri, options?)" },
		{ name: "@put", description: "Send PUT request. @put(uri, options?)" },
		{ name: "@patch", description: "Send PATCH request. @patch(uri, options?)" },
		{ name: "@query", description: "Send QUERY request. @query(uri, options?)" },
		{ name: "@delete", description: "Send DELETE request. @delete(uri, options?)" },
		{
			name: "@clipboard",
			description: "[Pro] Copy text to clipboard. @clipboard(text, isBase64?)",
		},
		{
			name: "@fit",
			description:
				"[Pro] Linear interpolation. @fit(v, oldMin, oldMax, newMin, newMax, clamped?, rounded?)",
		},
		{ name: "@intl", description: "[Pro] Intl formatting. @intl(type, value, options?, locale?)" },
		// Action options
		{ name: "contentType", description: "Request content type: 'json' or 'form'" },
		{ name: "filterSignals", description: "Filter object: {include: RegExp, exclude?: RegExp}" },
		{ name: "selector", description: "CSS selector for form when contentType='form'" },
		{ name: "headers", description: "Request headers object" },
		{ name: "openWhenHidden", description: "Keep SSE connection open when page hidden" },
		{ name: "payload", description: "Override fetch payload with custom object" },
		{ name: "retry", description: "Retry behavior: 'auto', 'error', 'always', 'never'" },
		{ name: "retryInterval", description: "Retry interval in milliseconds" },
		{ name: "retryScaler", description: "Multiplier for retry wait times" },
		{ name: "retryMaxWait", description: "Maximum wait time between retries (ms)" },
		{ name: "retryMaxCount", description: "Maximum retry attempts" },
		{
			name: "requestCancellation",
			description: "Cancellation behavior: 'auto', 'cleanup', 'disabled', or AbortController",
		},
	],
});
htmlLS.setDataProviders(true, [
	datastarProvider,
	datastarActions,
	htmlService.getDefaultHTMLDataProvider(),
]);
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

// Extract signals from data-signals:* attributes in HTML
function extractSignals(htmlText: string): string[] {
	const signals = new Set<string>();
	// match data-signals:signalName="..."
	const re1 = /data-signals:([a-zA-Z_][a-zA-Z0-9_-]*)/g;
	let m;
	while ((m = re1.exec(htmlText)) !== null) {
		// convert kebab to camelCase
		const name = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
		signals.add(name);
	}
	// match data-signals="{signalName: ...}"
	const re2 = /data-signals="\{([^}]+)\}"/g;
	while ((m = re2.exec(htmlText)) !== null) {
		const content = m[1];
		const keyRe = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
		let km;
		while ((km = keyRe.exec(content)) !== null) {
			signals.add(km[1]);
		}
	}
	// match data-bind:signalName
	const re3 = /data-bind:([a-zA-Z_][a-zA-Z0-9_-]*)/g;
	while ((m = re3.exec(htmlText)) !== null) {
		const name = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
		signals.add(name);
	}
	// match data-ref:signalName
	const re4 = /data-ref:([a-zA-Z_][a-zA-Z0-9_-]*)/g;
	while ((m = re4.exec(htmlText)) !== null) {
		const name = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
		signals.add(name);
	}
	// match data-computed:signalName
	const re5 = /data-computed:([a-zA-Z_][a-zA-Z0-9_-]*)/g;
	while ((m = re5.exec(htmlText)) !== null) {
		const name = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
		signals.add(name);
	}
	// match data-indicator:signalName
	const re6 = /data-indicator:([a-zA-Z_][a-zA-Z0-9_-]*)/g;
	while ((m = re6.exec(htmlText)) !== null) {
		const name = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
		signals.add(name);
	}
	return [...signals];
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
		// check if cursor is in $signal reference context
		const beforeCursor = text.slice(tpl.contentStart, offset);
		const dollarMatch = beforeCursor.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)?$/);
		if (dollarMatch) {
			const prefix = dollarMatch[1] || "";
			const signals = extractSignals(htmlText);
			const items = signals
				.filter((s) => s.toLowerCase().startsWith(prefix.toLowerCase()))
				.map((s) => ({
					label: `$${s}`,
					kind: htmlService.CompletionItemKind.Variable,
					insertText: s,
					detail: "DataStar signal",
				}));
			return items;
		}
		// check if cursor is in @action() context
		const actionMatch = beforeCursor.match(/@([a-zA-Z_][a-zA-Z0-9_]*)?$/);
		if (actionMatch) {
			const prefix = actionMatch[1] || "";
			const actions = [
				{
					name: "@peek",
					detail: "Access signals without subscribing",
					insert: "peek(${1:() => $signal})",
				},
				{
					name: "@setAll",
					detail: "Set value of matching signals",
					insert: "setAll(${1:value}, ${2:{include: /^${3:pattern}$/}})",
				},
				{
					name: "@toggleAll",
					detail: "Toggle boolean value of matching signals",
					insert: "toggleAll(${1:{include: /^${2:pattern}$/}})",
				},
				{ name: "@get", detail: "Send GET request", insert: "get(${1:'/endpoint'})" },
				{ name: "@post", detail: "Send POST request", insert: "post(${1:'/endpoint'})" },
				{ name: "@put", detail: "Send PUT request", insert: "put(${1:'/endpoint'})" },
				{ name: "@patch", detail: "Send PATCH request", insert: "patch(${1:'/endpoint'})" },
				{ name: "@query", detail: "Send QUERY request", insert: "query(${1:'/endpoint'})" },
				{ name: "@delete", detail: "Send DELETE request", insert: "delete(${1:'/endpoint'})" },
				{
					name: "@clipboard",
					detail: "[Pro] Copy text to clipboard",
					insert: "clipboard(${1:'text'})",
				},
				{
					name: "@fit",
					detail: "[Pro] Linear interpolation",
					insert: "fit(${1:v}, ${2:oldMin}, ${3:oldMax}, ${4:newMin}, ${5:newMax})",
				},
				{
					name: "@intl",
					detail: "[Pro] Intl formatting",
					insert: "intl(${1:'number'}, ${2:value}, ${3:{}})",
				},
			];
			const items = actions
				.filter((a) => a.name.toLowerCase().startsWith(`@${prefix}`.toLowerCase()))
				.map((a) => ({
					label: a.name,
					kind: htmlService.CompletionItemKind.Function,
					insertText: a.insert,
					insertTextFormat: 2,
					detail: a.detail,
				}));
			return items;
		}
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

// DataStar attribute documentation lookup
const datastarDocs: Record<
	string,
	{ syntax: string; description: string; modifiers: string[]; example: string }
> = {
	"data-attr": {
		syntax: 'data-attr[:key]="expression"',
		description:
			"Sets HTML attribute value from expression and keeps in sync. Supports object syntax for multiple attributes.",
		modifiers: ["__case"],
		example: '<div data-attr:aria-label="$foo"></div>\n<div data-attr="{disabled: $bar}"></div>',
	},
	"data-bind": {
		syntax: 'data-bind[:key]="signalName"',
		description: "Creates signal and sets up two-way data binding with element value.",
		modifiers: ["__case", "__prop", "__event"],
		example: '<input data-bind:foo />\n<input data-bind="foo" />',
	},
	"data-class": {
		syntax: 'data-class[:key]="expression"',
		description:
			"Adds/removes class based on expression. Supports object syntax for multiple classes.",
		modifiers: ["__case"],
		example: "<div data-class:font-bold=$foo></div>",
	},
	"data-computed": {
		syntax: 'data-computed[:key]="expression"',
		description: "Creates read-only computed signal. Updates when dependencies change.",
		modifiers: ["__case"],
		example: '<div data-computed:foo="$bar + $baz"></div>',
	},
	"data-effect": {
		syntax: 'data-effect="expression"',
		description: "Runs expression on page load and when signals in expression change.",
		modifiers: [],
		example: '<div data-effect="$foo = $bar + $baz"></div>',
	},
	"data-ignore": {
		syntax: "data-ignore",
		description: "Tells DataStar to skip this element and descendants.",
		modifiers: ["__self"],
		example: "<div data-ignore>...</div>",
	},
	"data-indicator": {
		syntax: 'data-indicator[:key]="signalName"',
		description: "Creates signal that is true during fetch requests, false otherwise.",
		modifiers: ["__case"],
		example: "<button data-on:click=@get() data-indicator:fetching></button>",
	},
	"data-init": {
		syntax: 'data-init="expression"',
		description: "Runs expression when attribute is initialized.",
		modifiers: ["__delay", "__viewtransition"],
		example: '<div data-init="$count = 1"></div>',
	},
	"data-json-signals": {
		syntax: 'data-json-signals="filterObject"',
		description: "Displays reactive JSON stringified signals. Useful for debugging.",
		modifiers: ["__terse"],
		example: "<pre data-json-signals></pre>",
	},
	"data-on": {
		syntax: 'data-on:event="expression"',
		description: "Attaches event listener. Executes expression on event trigger.",
		modifiers: [
			"__once",
			"__passive",
			"__capture",
			"__case",
			"__delay",
			"__debounce",
			"__throttle",
			"__viewtransition",
			"__window",
			"__document",
			"__outside",
			"__prevent",
			"__stop",
		],
		example: '<button data-on:click="$foo = 1">Reset</button>',
	},
	"data-on-intersect": {
		syntax: 'data-on-intersect="expression"',
		description: "Runs expression when element intersects viewport.",
		modifiers: [
			"__once",
			"__exit",
			"__half",
			"__full",
			"__threshold",
			"__delay",
			"__debounce",
			"__throttle",
			"__viewtransition",
		],
		example: '<div data-on-intersect="$intersected = true"></div>',
	},
	"data-on-interval": {
		syntax: 'data-on-interval="expression"',
		description: "Runs expression at regular interval. Default: 1 second.",
		modifiers: ["__duration", "__viewtransition"],
		example: '<div data-on-interval="$count++"></div>',
	},
	"data-on-signal-patch": {
		syntax: 'data-on-signal-patch="expression"',
		description: "Runs expression when any signals are patched.",
		modifiers: ["__delay", "__debounce", "__throttle"],
		example: '<div data-on-signal-patch="console.log(1)"></div>',
	},
	"data-ref": {
		syntax: 'data-ref[:key]="signalName"',
		description: "Creates signal that references the element.",
		modifiers: ["__case"],
		example: "<div data-ref:foo></div>",
	},
	"data-show": {
		syntax: 'data-show="expression"',
		description: "Shows/hides element based on expression truthiness.",
		modifiers: [],
		example: '<div data-show="$foo"></div>',
	},
	"data-signals": {
		syntax: 'data-signals[:key]="expression"',
		description: "Patches signals. Supports dot-notation for nested signals and object syntax.",
		modifiers: ["__case", "__ifmissing"],
		example: '<div data-signals:foo="1"></div>',
	},
	"data-style": {
		syntax: 'data-style[:key]="expression"',
		description:
			"Sets inline CSS style from expression. Supports object syntax for multiple properties.",
		modifiers: [],
		example: '<div data-style:display="$hiding && 1"></div>',
	},
	"data-text": {
		syntax: 'data-text="expression"',
		description: "Binds text content of element to expression.",
		modifiers: [],
		example: '<div data-text="$foo"></div>',
	},
	"data-preserve-attr": {
		syntax: 'data-preserve-attr="attr1 attr2"',
		description: "Preserves attribute values when morphing DOM elements.",
		modifiers: [],
		example: '<details open data-preserve-attr="open">...</details>',
	},
	"data-animate": {
		syntax: 'data-animate="expression"',
		description: "[Pro] Animates element attributes over time. Updates reactively.",
		modifiers: [],
		example: "",
	},
	"data-custom-validity": {
		syntax: 'data-custom-validity="expression"',
		description: "[Pro] Adds custom validity. Expression must return string (empty = valid).",
		modifiers: [],
		example: "<input data-bind:foo />",
	},
	"data-match-media": {
		syntax: 'data-match-media[:key]="mediaQuery"',
		description: "[Pro] Sets signal to media query match state and keeps in sync.",
		modifiers: ["__case"],
		example: "<div data-match-media:is-dark=dark></div>",
	},
	"data-persist": {
		syntax: 'data-persist[:key]="filterObject"',
		description: "[Pro] Persists signals to local/session storage.",
		modifiers: ["__session"],
		example: "<div data-persist></div>",
	},
	"data-query-string": {
		syntax: 'data-query-string="filterObject"',
		description: "[Pro] Syncs signals to query string params on load and change.",
		modifiers: ["__filter", "__history"],
		example: "<div data-query-string></div>",
	},
	"data-replace-url": {
		syntax: 'data-replace-url="expression"',
		description: "[Pro] Replaces browser URL without reloading page.",
		modifiers: [],
		example: "<div data-replace-url=1></div>",
	},
	"data-scroll-into-view": {
		syntax: "data-scroll-into-view",
		description: "[Pro] Scrolls element into view.",
		modifiers: [
			"__smooth",
			"__instant",
			"__auto",
			"__hstart",
			"__hcenter",
			"__hend",
			"__hnearest",
			"__vstart",
			"__vcenter",
			"__vend",
			"__vnearest",
			"__focus",
		],
		example: "<div data-scroll-into-view></div>",
	},
	"data-view-transition": {
		syntax: 'data-view-transition="expression"',
		description: "[Pro] Sets view-transition-name style attribute.",
		modifiers: [],
		example: '<div data-view-transition="$foo"></div>',
	},
};

// DataStar action documentation
const datastarActionDocs: Record<
	string,
	{ syntax: string; description: string; options: string[] }
> = {
	"@peek": {
		syntax: "@peek(callable)",
		description: "Access signals without subscribing to changes.",
		options: [],
	},
	"@setAll": {
		syntax: "@setAll(value, filter?)",
		description: "Set value of all matching signals.",
		options: ["include: RegExp", "exclude?: RegExp"],
	},
	"@toggleAll": {
		syntax: "@toggleAll(filter?)",
		description: "Toggle boolean value of all matching signals.",
		options: ["include: RegExp", "exclude?: RegExp"],
	},
	"@get": {
		syntax: "@get(uri, options?)",
		description: "Send GET request to backend via Fetch API.",
		options: [
			"contentType",
			"filterSignals",
			"selector",
			"headers",
			"openWhenHidden",
			"payload",
			"retry",
			"retryInterval",
			"retryScaler",
			"retryMaxWait",
			"retryMaxCount",
			"requestCancellation",
		],
	},
	"@post": {
		syntax: "@post(uri, options?)",
		description: "Send POST request to backend via Fetch API.",
		options: [
			"contentType",
			"filterSignals",
			"selector",
			"headers",
			"openWhenHidden",
			"payload",
			"retry",
			"retryInterval",
			"retryScaler",
			"retryMaxWait",
			"retryMaxCount",
			"requestCancellation",
		],
	},
	"@put": {
		syntax: "@put(uri, options?)",
		description: "Send PUT request to backend via Fetch API.",
		options: [
			"contentType",
			"filterSignals",
			"selector",
			"headers",
			"openWhenHidden",
			"payload",
			"retry",
			"retryInterval",
			"retryScaler",
			"retryMaxWait",
			"retryMaxCount",
			"requestCancellation",
		],
	},
	"@patch": {
		syntax: "@patch(uri, options?)",
		description: "Send PATCH request to backend via Fetch API.",
		options: [
			"contentType",
			"filterSignals",
			"selector",
			"headers",
			"openWhenHidden",
			"payload",
			"retry",
			"retryInterval",
			"retryScaler",
			"retryMaxWait",
			"retryMaxCount",
			"requestCancellation",
		],
	},
	"@query": {
		syntax: "@query(uri, options?)",
		description: "Send QUERY request to backend via Fetch API.",
		options: [
			"contentType",
			"filterSignals",
			"selector",
			"headers",
			"openWhenHidden",
			"payload",
			"retry",
			"retryInterval",
			"retryScaler",
			"retryMaxWait",
			"retryMaxCount",
			"requestCancellation",
		],
	},
	"@delete": {
		syntax: "@delete(uri, options?)",
		description: "Send DELETE request to backend via Fetch API.",
		options: [
			"contentType",
			"filterSignals",
			"selector",
			"headers",
			"openWhenHidden",
			"payload",
			"retry",
			"retryInterval",
			"retryScaler",
			"retryMaxWait",
			"retryMaxCount",
			"requestCancellation",
		],
	},
	"@clipboard": {
		syntax: "@clipboard(text, isBase64?)",
		description: "[Pro] Copy text to clipboard.",
		options: [],
	},
	"@fit": {
		syntax: "@fit(v, oldMin, oldMax, newMin, newMax, shouldClamp?, shouldRound?)",
		description: "[Pro] Linear interpolation between ranges.",
		options: [],
	},
	"@intl": {
		syntax: "@intl(type, value, options?, locale?)",
		description: "[Pro] Intl formatting for dates, numbers, and more.",
		options: [],
	},
};

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
		if (hover) return hover as any;
		// fallback: check if word is a DataStar attribute or action
		const wordRange2 = wordRangeAt(doc, params.position, /[a-zA-Z0-9_@:.-]+/);
		if (wordRange2) {
			const word2 = doc.getText(wordRange2);
			// check data-* attributes
			for (const [attr, info] of Object.entries(datastarDocs)) {
				if (word2.startsWith(attr)) {
					const modList = info.modifiers.length ? info.modifiers.join(", ") : "none";
					return {
						contents: {
							kind: "markdown",
							value: `**${attr}**\n\n${info.description}\n\n**Syntax:** \`${info.syntax}\`\n\n**Modifiers:** ${modList}`,
						},
						range: wordRange2,
					};
				}
			}
			// check @actions
			for (const [action, info] of Object.entries(datastarActionDocs)) {
				if (word2.startsWith(action)) {
					const optList = info.options.length ? info.options.join(", ") : "none";
					return {
						contents: {
							kind: "markdown",
							value: `**${action}**\n\n${info.description}\n\n**Syntax:** \`${info.syntax}\`\n\n**Options:** ${optList}`,
						},
						range: wordRange2,
					};
				}
			}
		}
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
