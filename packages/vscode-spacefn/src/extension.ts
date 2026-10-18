import * as cp from "node:child_process";

import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
	const collection = vscode.languages.createDiagnosticCollection("spacefn");
	context.subscriptions.push(collection);

	const runDoctor = async (doc: vscode.TextDocument) => {
		if (!doc.fileName.endsWith(".sql")) return;
		if (!doc.fileName.includes("/app/db/") && !doc.fileName.includes("\\app\\db\\")) return;
		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!cwd) return;
		cp.exec("npx space db doctor --json", { cwd }, (err, stdout) => {
			collection.delete(doc.uri);
			const diags: vscode.Diagnostic[] = [];
			try {
				const parsed = JSON.parse(stdout || "[]");
				for (const item of Array.isArray(parsed) ? parsed : []) {
					const range = new vscode.Range(0, 0, 0, 1);
					diags.push(
						new vscode.Diagnostic(
							range,
							item.message ?? String(item),
							vscode.DiagnosticSeverity.Error,
						),
					);
				}
			} catch {
				if (err)
					diags.push(
						new vscode.Diagnostic(
							new vscode.Range(0, 0, 0, 1),
							err.message,
							vscode.DiagnosticSeverity.Error,
						),
					);
			}
			collection.set(doc.uri, diags);
		});
	};

	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(runDoctor));
	context.subscriptions.push(
		vscode.commands.registerCommand("spacefn.dbDoctor", () => {
			const editor = vscode.window.activeTextEditor;
			if (editor) runDoctor(editor.document);
		}),
	);
}

export function deactivate(): void {}
