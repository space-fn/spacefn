import { TextDocument } from "vscode-languageserver-textdocument";
import type { CompletionItem } from "vscode-languageserver/node";

import type { CompletionDeps, TemplateRange } from "./types";
import { inRange } from "./types";

/** Completions inside a `css` tagged template: custom properties then the CSS language service. */
export function cssCompletions(
	deps: CompletionDeps,
	ctx: {
		doc: import("vscode-languageserver-textdocument").TextDocument;
		text: string;
		offset: number;
	},
	cssTpl: TemplateRange,
): CompletionItem[] | null {
	if (!inRange(cssTpl, ctx.offset)) return null;
	const beforeCursor = ctx.text.slice(cssTpl.contentStart, ctx.offset);
	const m = beforeCursor.match(/--[a-zA-Z0-9_-]*$/);
	const prefix = m ? m[0] : "";
	if (prefix.startsWith("--") || beforeCursor.endsWith("-")) {
		const items = [...deps.customProps.entries()]
			.filter(([name]) => name.toLowerCase().startsWith(prefix.toLowerCase()))
			.map(([name, value]) => ({
				label: name,
				kind: 6,
				insertText: name,
				detail: value,
			}));
		if (items.length) return items as CompletionItem[];
	}
	const cssContent = ctx.text.slice(cssTpl.contentStart, cssTpl.end);
	const safe = cssContent.replace(/\${[\s\S]*?}/g, (s) => " ".repeat(s.length));
	const cssDoc = TextDocument.create("file:///css-template.css", "css", 1, safe);
	const cssPos = cssDoc.positionAt(ctx.offset - cssTpl.contentStart);
	const stylesheet = deps.cssLS.parseStylesheet(cssDoc);
	const cssCompletions = deps.cssLS.doComplete(cssDoc, cssPos, stylesheet);
	if (cssCompletions && cssCompletions.items && cssCompletions.items.length) {
		return cssCompletions.items.map((it) => ({
			label: it.label,
			kind: it.kind,
			insertText: it.insertText ?? it.label,
			detail: it.detail,
		}));
	}
	return null;
}
