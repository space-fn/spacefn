import * as cssService from "vscode-css-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";

import { taggedTemplates } from "../lib/templates";

const cssLS = cssService.getCSSLanguageService();

export async function validateCssTemplates(doc: TextDocument): Promise<Diagnostic[]> {
	const text = doc.getText();
	const diagnostics: Diagnostic[] = [];
	for (const { contentStart, end } of taggedTemplates(text, ["css"])) {
		const content = text.slice(contentStart, end);
		const safe = content.replace(/\${[\s\S]*?}/g, (s) => " ".repeat(s.length));
		const cssDoc = TextDocument.create("file:///css-template.css", "css", 1, safe);
		const stylesheet = cssLS.parseStylesheet(cssDoc);
		const cssDiags = cssLS.doValidation(cssDoc, stylesheet);
		for (const d of cssDiags) {
			const startOff = contentStart + cssDoc.offsetAt(d.range.start);
			const endOff = contentStart + cssDoc.offsetAt(d.range.end);
			diagnostics.push({
				severity: d.severity === 1 ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
				range: { start: doc.positionAt(startOff), end: doc.positionAt(endOff) },
				message: d.message,
				source: "spacefn-css",
			});
		}
	}
	return diagnostics;
}
