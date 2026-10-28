import * as path from "node:path";

import { scratchDatabase } from "spacefn/db";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";

import { extractBadIdentifier, loadDialectAndMigrations, rangeForIdentifier } from "./sql";

export function findDbDir(filePath: string): string | null {
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

export async function validateEmbedded(doc: TextDocument): Promise<Diagnostic[]> {
	const uri = doc.uri;
	const filePath = uri.startsWith("file://") ? decodeURIComponent(uri.replace("file://", "")) : uri;
	if (!filePath.endsWith(".ts") && !filePath.endsWith(".js")) return [];
	const resolved = resolveDbDir(filePath);
	if (!resolved) return [];
	const targetDb = resolved.targetDb;

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
	return diagnostics;
}

export function resolveDbDir(filePath: string): { dbDir: string; targetDb: string } | null {
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
