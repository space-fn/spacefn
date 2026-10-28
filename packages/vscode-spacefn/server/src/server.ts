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
	DidChangeWatchedFilesNotification,
} from "vscode-languageserver/node";

import { complete } from "./completion";
import { datastarDocs, datastarActionDocs } from "./completion/data";
import { validateCssTemplates } from "./diagnostics/css";
import { validateHtmlDatastar } from "./diagnostics/datastar";
import { resolveDbDir, validateEmbedded } from "./diagnostics/embedded";
import { loadDialectAndMigrations, validateSqlDiagnostics } from "./diagnostics/sql";
import { definition } from "./language/definition";
import { hover } from "./language/hover";
import {} from "./lib/helpers";

/** Validates a .sql file and sends diagnostics. */
async function validateSqlFile(doc: TextDocument): Promise<void> {
	void connection.sendDiagnostics({ uri: doc.uri, diagnostics: await validateSqlDiagnostics(doc) });
}

const readDir = async (dir: string) => fsp.readdir(dir);
const readFile = async (p: string) => fsp.readFile(p, "utf8");
const joinPath = (...parts: string[]) => path.join(...parts);

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
	const isJsTs = /\.(js|ts|jsx|tsx)$/.test(filePath);
	const ctx = {
		doc,
		text: doc.getText(),
		offset: doc.offsetAt(params.position),
		filePath,
		isJsTs,
		position: params.position,
	};
	return hover(ctx, {
		htmlLS,
		cssLS,
		htmlService,
		getSchema,
		datastarDocs,
		datastarActionDocs,
		readDir,
		readFile,
		joinPath,
	});
});

connection.onDefinition(async (params) => {
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
		position: params.position,
	};
	return definition(ctx, {
		htmlLS,
		cssLS,
		htmlService,
		getSchema,
		datastarDocs,
		datastarActionDocs,
		readDir,
		readFile,
		joinPath,
	});
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
