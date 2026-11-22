import * as cssService from "vscode-css-languageservice";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";

import { cssRegions, type CssRegion } from "../lib/cssRegions";

const cssLS = cssService.getCSSLanguageService();

/** A problem that comes from masking a `${...}`, whose value isn't known here. */
function causedByHole({ doc, holes }: CssRegion, found: cssService.Diagnostic): boolean {
	const start = doc.offsetAt(found.range.start);
	const end = doc.offsetAt(found.range.end);
	if (holes.some((h) => start <= h.end && end >= h.start)) return true;
	if (found.code !== "emptyRules") return false;
	// The warning is on the selector, and the hole that fills the rule is in its braces.
	const close = doc.getText().indexOf("}", end);
	return holes.some((h) => h.start >= end && h.end <= close);
}

export async function validateCssTemplates(doc: TextDocument): Promise<Diagnostic[]> {
	const diagnostics: Diagnostic[] = [];
	for (const region of cssRegions(doc.getText())) {
		const css = region.doc;
		for (const d of cssLS.doValidation(css, cssLS.parseStylesheet(css))) {
			if (causedByHole(region, d)) continue;
			const startOff = region.start + css.offsetAt(d.range.start);
			const endOff = region.start + css.offsetAt(d.range.end);
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
