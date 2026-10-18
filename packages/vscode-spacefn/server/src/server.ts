import * as path from "node:path";

import { scanMigrations, analyzeQueries } from "spacefn/db";
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

async function validate(doc: TextDocument): Promise<void> {
	const uri = doc.uri;
	const filePath = uri.startsWith("file://") ? decodeURIComponent(uri.replace("file://", "")) : uri;
	const m = filePath.match(/[/\\]app[/\\]db[/\\]([^/\\]+)[/\\]queries[/\\]/);
	if (!m) return;
	const dbDir = filePath.replace(/[/\\]queries[/\\].*/, "");
	const migrationsDir = path.join(dbDir, "migrations");
	const queriesDir = path.join(dbDir, "queries");

	let dialect: "sqlite" | "postgres" = "sqlite";
	try {
		const cfg = await import(path.join(dbDir, "config.ts"));
		dialect = (cfg.default ?? cfg).dialect ?? "sqlite";
	} catch {
		dialect = "sqlite";
	}

	const diagnostics: Diagnostic[] = [];
	try {
		const migrations = await scanMigrations(migrationsDir);
		await analyzeQueries(queriesDir, migrations, dialect);
	} catch (err) {
		diagnostics.push({
			severity: DiagnosticSeverity.Error,
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
			message: err instanceof Error ? err.message : String(err),
			source: "spacefn",
		});
	}
	void connection.sendDiagnostics({ uri, diagnostics });
}

documents.onDidChangeContent((change) => {
	void validate(change.document);
});
documents.onDidOpen((e) => {
	void validate(e.document);
});

connection.onInitialize(() => ({
	capabilities: {
		textDocumentSync: 1,
		diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
	},
}));

connection.listen();
