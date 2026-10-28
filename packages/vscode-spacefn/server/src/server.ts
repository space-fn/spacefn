import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

import { scratchDatabase } from "spacefn/db";
import * as cssService from "vscode-css-languageservice";
import * as htmlService from "vscode-html-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	Diagnostic,
	Hover,
	Location,
	DidChangeWatchedFilesNotification,
} from "vscode-languageserver/node";

import { complete } from "./completion";
import { datastarDocs, datastarActionDocs } from "./completion/data";
import { validateCssTemplates } from "./diagnostics/css";
import { validateHtmlDatastar } from "./diagnostics/datastar";
import { resolveDbDir, validateEmbedded } from "./diagnostics/embedded";
import { loadDialectAndMigrations, validateSqlDiagnostics } from "./diagnostics/sql";
import {
	inSqlString,
	findHtmlTemplateRange,
	findCssTemplateRange,
	resolveAliases,
	wordRangeAt,
	offsetToPosition,
} from "./lib/helpers";

/** Validates a .sql file and sends diagnostics. */
async function validateSqlFile(doc: TextDocument): Promise<void> {
	void connection.sendDiagnostics({ uri: doc.uri, diagnostics: await validateSqlDiagnostics(doc) });
}

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

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

let workspaceRoot = process.cwd();
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

/** Validates JS/TS files with embedded templates and sends diagnostics. */
async function validateJsTs(doc: TextDocument): Promise<void> {
	const all: Diagnostic[] = [];
	all.push(...(await validateHtmlDatastar(doc)));
	all.push(...(await validateCssTemplates(doc)));
	all.push(...(await validateEmbedded(doc)));
	void connection.sendDiagnostics({ uri: doc.uri, diagnostics: all });
}

documents.onDidChangeContent((change) => {
	if (change.document.uri.includes("/migrations/") || change.document.uri.includes("/db/"))
		schemaCache.clear();
	if (change.document.uri.endsWith(".sql")) void validateSqlFile(change.document);
	else if (
		change.document.uri.endsWith(".js") ||
		change.document.uri.endsWith(".ts") ||
		change.document.uri.endsWith(".jsx") ||
		change.document.uri.endsWith(".tsx")
	) {
		void validateJsTs(change.document);
	} else
		void validateEmbedded(change.document).then((d) => {
			void connection.sendDiagnostics({ uri: change.document.uri, diagnostics: d });
		});
});
documents.onDidOpen((e) => {
	if (e.document.uri.endsWith(".sql")) void validateSqlFile(e.document);
	else if (
		e.document.uri.endsWith(".js") ||
		e.document.uri.endsWith(".ts") ||
		e.document.uri.endsWith(".jsx") ||
		e.document.uri.endsWith(".tsx")
	) {
		void validateJsTs(e.document);
	} else
		void validateEmbedded(e.document).then((d) => {
			void connection.sendDiagnostics({ uri: e.document.uri, diagnostics: d });
		});
});

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

const customProps = new Map<string, string>();
const cssLS = cssService.getCSSLanguageService();

function scanCustomProps(root: string) {
	customProps.clear();
	function walk(dir: string) {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			const full = path.join(dir, e.name);
			if (e.isDirectory()) {
				if (e.name === "node_modules" || e.name.startsWith(".")) continue;
				walk(full);
			} else if (e.name === "variables.css") {
				try {
					const text = fs.readFileSync(full, "utf8");
					for (const m of text.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g)) {
						customProps.set(m[1]!, m[2]!.trim());
					}
				} catch {
					/* ignore */
				}
			}
		}
	}
	walk(root);
}

connection.onCompletion(async (params) => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return null;
	const filePath = params.textDocument.uri.startsWith("file://")
		? decodeURIComponent(params.textDocument.uri.replace("file://", ""))
		: params.textDocument.uri;
	const isJsTs = /\.(js|ts|jsx|tsx)$/.test(filePath);
	const ctx = {
		doc,
		text: doc.getText(),
		offset: doc.offsetAt(params.position),
		filePath,
		isJsTs,
	};
	return complete(ctx, { htmlLS, cssLS, customProps, getSchema, htmlService }, resolveDbDir);
});

// DataStar attribute documentation lookup

// DataStar action documentation

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
	const cssTpl = isJsTs ? findCssTemplateRange(text, offset) : null;
	if (cssTpl && offset >= cssTpl.contentStart && offset <= cssTpl.end) {
		const cssContent = text.slice(cssTpl.contentStart, cssTpl.end);
		const safe = cssContent.replace(/\${[\s\S]*?}/g, (s) => " ".repeat(s.length));
		const cssDoc = TextDocument.create("file:///css-template.css", "css", 1, safe);
		const cssPos = cssDoc.positionAt(offset - cssTpl.contentStart);
		const stylesheet = cssLS.parseStylesheet(cssDoc);
		const h = cssLS.doHover(cssDoc, cssPos, stylesheet);
		if (h) return h as any;
	}
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
		files = await fsp.readdir(migrationsDir);
	} catch {
		return null;
	}
	for (const f of files) {
		if (!f.endsWith(".sql")) continue;
		const full = path.join(migrationsDir, f);
		const content = await fsp.readFile(full, "utf8");
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

connection.onInitialized(async () => {
	try {
		await connection.client.register(DidChangeWatchedFilesNotification.type, {
			watchers: [{ globPattern: "**/migrations/*" }, { globPattern: "**/variables.css" }],
		});
	} catch {
		// ignore
	}
	scanCustomProps(workspaceRoot);
});

connection.onDidChangeWatchedFiles((params) => {
	schemaCache.clear();
	for (const doc of documents.all()) {
		if (doc.uri.endsWith(".sql")) void validateSqlFile(doc);
		else
			void validateEmbedded(doc).then((d) => {
				void connection.sendDiagnostics({ uri: doc.uri, diagnostics: d });
			});
	}
	if (params.changes.some((c) => c.uri.endsWith("variables.css"))) {
		scanCustomProps(workspaceRoot);
	}
});

connection.onInitialize((params) => {
	if (params.workspaceFolders && params.workspaceFolders.length) {
		workspaceRoot = decodeURIComponent(params.workspaceFolders[0]!.uri.replace("file://", ""));
	}
	return {
		capabilities: {
			textDocumentSync: 1,
			completionProvider: {
				triggerCharacters: ["<", "/", " ", "=", '"', "'", ":", "-", "@", "_", "$"],
			},
			hoverProvider: true,
			definitionProvider: true,
		},
	};
});
documents.listen(connection);
connection.listen();
