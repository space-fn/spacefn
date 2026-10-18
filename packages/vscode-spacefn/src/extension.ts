import * as path from "node:path";

import * as vscode from "vscode";
import { LanguageClient, TransportKind } from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
	const serverModule = context.asAbsolutePath(path.join("server-out", "server.js"));
	const serverOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc },
	};
	const clientOptions = { documentSelector: [{ scheme: "file", language: "sql" }] };
	client = new LanguageClient("spacefn", "spacefn SQL", serverOptions, clientOptions);
	const disposable = client.start();
	context.subscriptions.push({
		dispose: () => {
			void disposable.then(() => client?.stop());
		},
	});

	context.subscriptions.push(
		vscode.commands.registerCommand("spacefn.dbDoctor", async () => {
			const terminal = vscode.window.createTerminal("space db doctor");
			terminal.show();
			terminal.sendText("npx space db doctor");
		}),
	);
}

export function deactivate(): Promise<void> | undefined {
	return client?.stop();
}
