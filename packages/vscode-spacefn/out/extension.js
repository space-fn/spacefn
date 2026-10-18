"use strict";
var __createBinding =
	(this && this.__createBinding) ||
	(Object.create
		? function (o, m, k, k2) {
				if (k2 === undefined) k2 = k;
				var desc = Object.getOwnPropertyDescriptor(m, k);
				if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
					desc = {
						enumerable: true,
						get: function () {
							return m[k];
						},
					};
				}
				Object.defineProperty(o, k2, desc);
			}
		: function (o, m, k, k2) {
				if (k2 === undefined) k2 = k;
				o[k2] = m[k];
			});
var __setModuleDefault =
	(this && this.__setModuleDefault) ||
	(Object.create
		? function (o, v) {
				Object.defineProperty(o, "default", { enumerable: true, value: v });
			}
		: function (o, v) {
				o["default"] = v;
			});
var __importStar =
	(this && this.__importStar) ||
	(function () {
		var ownKeys = function (o) {
			ownKeys =
				Object.getOwnPropertyNames ||
				function (o) {
					var ar = [];
					for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
					return ar;
				};
			return ownKeys(o);
		};
		return function (mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null)
				for (var k = ownKeys(mod), i = 0; i < k.length; i++)
					if (k[i] !== "default") __createBinding(result, mod, k[i]);
			__setModuleDefault(result, mod);
			return result;
		};
	})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const cp = __importStar(require("node:child_process"));
const vscode = __importStar(require("vscode"));
function activate(context) {
	const collection = vscode.languages.createDiagnosticCollection("spacefn");
	context.subscriptions.push(collection);
	const runDoctor = async (doc) => {
		if (!doc.fileName.endsWith(".sql")) return;
		if (!doc.fileName.includes("/app/db/") && !doc.fileName.includes("\\app\\db\\")) return;
		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!cwd) return;
		cp.exec("npx space db doctor --json", { cwd }, (err, stdout) => {
			collection.delete(doc.uri);
			const diags = [];
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
function deactivate() {}
//# sourceMappingURL=extension.js.map
