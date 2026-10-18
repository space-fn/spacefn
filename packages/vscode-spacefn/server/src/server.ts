import * as path from "node:path";

import { scanMigrations, analyzeQueries, scratchDatabase } from "spacefn/db";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	Diagnostic,
	DiagnosticSeverity,
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
			// parent should be app
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
	// find a sub-db dir
	let targetDb: string | null = null;
	try {
		const entries = await (
			await import("node:fs/promises")
		).readdir(dbDir, { withFileTypes: true });
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

documents.onDidChangeContent((change) => {
	if (change.document.uri.endsWith(".sql")) void validateSqlFile(change.document);
	else void validateEmbedded(change.document);
});
documents.onDidOpen((e) => {
	if (e.document.uri.endsWith(".sql")) void validateSqlFile(e.document);
	else void validateEmbedded(e.document);
});

connection.onInitialize(() => ({
	capabilities: {
		textDocumentSync: 1,
		diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
	},
}));

connection.listen();
