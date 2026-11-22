import type { TextDocument } from "vscode-languageserver-textdocument";
import type { CompletionItem } from "vscode-languageserver/node";

import type { CssRegion } from "../lib/cssRegions";
import type { CompletionDeps } from "./types";
import { editAt, mapItemEdit } from "./types";

/** Completions inside CSS: custom properties, then the CSS language service. */
export function cssCompletions(
	deps: CompletionDeps,
	ctx: { doc: TextDocument; offset: number },
	region: CssRegion,
): CompletionItem[] {
	const cursor = ctx.offset - region.start;
	const beforeCursor = region.doc.getText().slice(0, cursor);
	// A custom property being typed: hyphens that start a name, not the one in `background-`.
	const prefix = beforeCursor.match(/(?<![\w-])(?:--[\w-]*|-)$/)?.[0];
	if (prefix) {
		const items = [...deps.customProps.entries()]
			.filter(([name]) => name.toLowerCase().startsWith(prefix.toLowerCase()))
			.map(([name, value]) => ({
				label: name,
				kind: 6,
				textEdit: editAt(ctx.doc, ctx.offset - prefix.length, ctx.offset, name),
				detail: value,
			}));
		if (items.length) return items as CompletionItem[];
	}
	// An edit stops at a `${...}`: the service sees it as part of the word and would delete it.
	let min = 0;
	let max = region.end - region.start;
	for (const hole of region.holes) {
		if (hole.end <= cursor) min = Math.max(min, hole.end);
		else if (hole.start >= cursor) max = Math.min(max, hole.start);
	}
	const toHost = (o: number) => region.start + Math.min(Math.max(o, min), max);

	const stylesheet = deps.cssLS.parseStylesheet(region.doc);
	const found = deps.cssLS.doComplete(region.doc, region.doc.positionAt(cursor), stylesheet);
	// Keep the service's edit range (mapped into the host file) and snippet format: a bare
	// insertText makes VS Code replace only its JS word, so `background-co` became
	// `background-background-color`.
	return found.items.map((it) => mapItemEdit(it, region.doc, ctx.doc, toHost));
}
