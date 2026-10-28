import * as cssService from "vscode-css-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";

const cssLS = cssService.getCSSLanguageService();

export async function validateCssTemplates(doc: TextDocument): Promise<Diagnostic[]> {
	const text = doc.getText();
	const diagnostics: Diagnostic[] = [];
	const re = /\bcss\s*`/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		const contentStart = m.index + m[0].length;
		let i = contentStart;
		let end = -1;
		let depth = 0;
		while (i < text.length) {
			const ch = text[i];
			if (ch === "`" && depth === 0) {
				end = i;
				break;
			}
			if (ch === "$" && text[i + 1] === "{") {
				let d = 1;
				i += 2;
				while (i < text.length && d > 0) {
					if (text[i] === "{") d++;
					else if (text[i] === "}") d--;
					i++;
				}
				continue;
			}
			i++;
		}
		if (end === -1) continue;
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
		re.lastIndex = end + 1;
	}
	return diagnostics;
}
