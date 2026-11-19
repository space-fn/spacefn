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
	const clientOptions = {
		documentSelector: [
			{ scheme: "file", language: "sql" },
			{ scheme: "file", language: "typescript" },
			{ scheme: "file", language: "javascript" },
			{ scheme: "file", language: "typescriptreact" },
			{ scheme: "file", language: "javascriptreact" },
		],
	};
	client = new LanguageClient("spacefn", "spacefn SQL", serverOptions, clientOptions);
	const disposable = client.start();
	context.subscriptions.push({
		dispose: () => {
			void disposable.then(() => client?.stop());
		},
	});

	// The CLI does the work; each command runs it in a terminal at the workspace root.
	const commands: Record<string, string> = {
		"spacefn.doctor": "space doctor",
		"spacefn.dbStatus": "space db status",
		"spacefn.gen": "space gen",
	};
	for (const [id, command] of Object.entries(commands))
		context.subscriptions.push(
			vscode.commands.registerCommand(id, () => {
				const terminal = vscode.window.createTerminal(command);
				terminal.show();
				terminal.sendText(`npx ${command}`);
			}),
		);
}

export function deactivate(): Promise<void> | undefined {
	return client?.stop();
}
