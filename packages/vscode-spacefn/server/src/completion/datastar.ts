import * as htmlService from "vscode-html-languageservice";
import type { CompletionItem } from "vscode-languageserver/node";

import { extractSignals } from "../lib/helpers";
import { inRange, type CompletionDeps, type TemplateRange } from "./types";

const MODIFIERS = [
	"once",
	"passive",
	"capture",
	"case",
	"delay",
	"debounce",
	"throttle",
	"viewtransition",
	"window",
	"document",
	"outside",
	"prevent",
	"stop",
	"duration",
	"exit",
	"half",
	"full",
	"threshold",
	"leading",
	"notrailing",
	"noleading",
	"trailing",
	"self",
	"terse",
	"session",
	"filter",
	"history",
	"smooth",
	"instant",
	"auto",
	"hstart",
	"hcenter",
	"hend",
	"hnearest",
	"vstart",
	"vcenter",
	"vend",
	"vnearest",
	"focus",
	"ifmissing",
	"prop",
	"event",
];

const MODIFIER_ARGS = [
	"camel",
	"kebab",
	"snake",
	"pascal",
	"leading",
	"notrailing",
	"trailing",
	"noleading",
	"500ms",
	"100ms",
	"1s",
	"2s",
	"300ms",
	"750ms",
	"1000ms",
	"0.25",
	"0.5",
	"0.75",
	"0.1",
	"0.9",
];

const ACTIONS = [
	{
		name: "@peek",
		detail: "Access signals without subscribing",
		insert: "peek(${1:() => $signal})",
	},
	{
		name: "@setAll",
		detail: "Set value of matching signals",
		insert: "setAll(${1:value}, ${2:{include: /^${3:pattern}$/}})",
	},
	{
		name: "@toggleAll",
		detail: "Toggle boolean value of matching signals",
		insert: "toggleAll(${1:{include: /^${2:pattern}$/}})",
	},
	{ name: "@get", detail: "Send GET request", insert: "get(${1:'/endpoint'})" },
	{ name: "@post", detail: "Send POST request", insert: "post(${1:'/endpoint'})" },
	{ name: "@put", detail: "Send PUT request", insert: "put(${1:'/endpoint'})" },
	{ name: "@patch", detail: "Send PATCH request", insert: "patch(${1:'/endpoint'})" },
	{ name: "@query", detail: "Send QUERY request", insert: "query(${1:'/endpoint'})" },
	{ name: "@delete", detail: "Send DELETE request", insert: "delete(${1:'/endpoint'})" },
	{ name: "@clipboard", detail: "[Pro] Copy text to clipboard", insert: "clipboard(${1:'text'})" },
	{
		name: "@fit",
		detail: "[Pro] Linear interpolation",
		insert: "fit(${1:v}, ${2:oldMin}, ${3:oldMax}, ${4:newMin}, ${5:newMax})",
	},
	{
		name: "@intl",
		detail: "[Pro] Intl formatting",
		insert: "intl(${1:'number'}, ${2:value}, ${3:{}})",
	},
];

/** Completions inside an `html` tagged template: signals, modifiers, actions, then the HTML language service. */
export function datastarCompletions(
	deps: CompletionDeps,
	ctx: {
		doc: import("vscode-languageserver-textdocument").TextDocument;
		text: string;
		offset: number;
	},
	tpl: TemplateRange,
): CompletionItem[] | null {
	if (!inRange(tpl, ctx.offset)) return null;
	const htmlText = ctx.text.slice(tpl.contentStart, tpl.end);
	const beforeCursor = ctx.text.slice(tpl.contentStart, ctx.offset);

	// $signal references
	const dollarMatch = beforeCursor.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)?$/);
	if (dollarMatch) {
		const prefix = dollarMatch[1] || "";
		const signals = extractSignals(htmlText);
		return signals
			.filter((s) => s.toLowerCase().startsWith(prefix.toLowerCase()))
			.map((s) => ({
				label: `$${s}`,
				kind: htmlService.CompletionItemKind.Variable,
				insertText: s,
				detail: "DataStar signal",
			}));
	}

	// __modifier
	const modMatch = beforeCursor.match(/data-[a-z-]+:[a-zA-Z0-9_-]*(__[a-z]*)?$/);
	const modMatch2 = beforeCursor.match(/data-[a-z-]+(__[a-z]*)?$/);
	if ((modMatch && modMatch[1] !== undefined) || (modMatch2 && modMatch2[1] !== undefined)) {
		const modPrefix = (modMatch?.[1] || modMatch2?.[1] || "").replace(/^__/, "");
		const items = MODIFIERS.filter((m) => m.toLowerCase().startsWith(modPrefix.toLowerCase())).map(
			(m) => ({
				label: `__${m}`,
				kind: htmlService.CompletionItemKind.Keyword,
				insertText: `__${m}`,
				detail: `DataStar modifier: ${m}`,
				filterText: `__${m}`,
				sortText: `__${m}`,
			}),
		);
		if (items.length) return items;
	}

	// .modifierArg
	const argMatch = beforeCursor.match(/__[a-z]+(\.[a-z0-9]*)?$/);
	if (argMatch && argMatch[1] !== undefined) {
		const argPrefix = argMatch[1].replace(/^\./, "");
		const items = MODIFIER_ARGS.filter((a) =>
			a.toLowerCase().startsWith(argPrefix.toLowerCase()),
		).map((a) => ({
			label: `.${a}`,
			kind: htmlService.CompletionItemKind.Value,
			insertText: `.${a}`,
			detail: `DataStar modifier arg: ${a}`,
			filterText: `.${a}`,
			sortText: `.${a}`,
		}));
		if (items.length) return items;
	}

	// @action()
	const actionMatch = beforeCursor.match(/@([a-zA-Z_][a-zA-Z0-9_]*)?$/);
	if (actionMatch) {
		const prefix = actionMatch[1] ?? "";
		return ACTIONS.filter((a) => a.name.toLowerCase().startsWith(`@${prefix}`.toLowerCase())).map(
			(a) => ({
				label: a.name,
				kind: htmlService.CompletionItemKind.Function,
				insertText: a.insert,
				insertTextFormat: 2,
				detail: a.detail,
				filterText: a.name,
				sortText: a.name,
			}),
		);
	}

	// general HTML completion via the language service, with ${...} masked to spaces
	let masked = "";
	let i = 0;
	while (i < htmlText.length) {
		if (htmlText[i] === "$" && htmlText[i + 1] === "{") {
			let d = 1;
			let j = i + 2;
			while (j < htmlText.length && d > 0) {
				if (htmlText[j] === "{") d++;
				else if (htmlText[j] === "}") d--;
				j++;
			}
			masked += " ".repeat(j - i);
			i = j;
		} else {
			masked += htmlText[i];
			i++;
		}
	}
	const htmlDoc = htmlService.TextDocument.create("file:///embedded.html", "html", 1, masked);
	const pos = htmlDoc.positionAt(ctx.offset - tpl.contentStart);
	const htmlDocParsed = deps.htmlLS.parseHTMLDocument(htmlDoc);
	const list = deps.htmlLS.doComplete(htmlDoc, pos, htmlDocParsed);
	if (!list) return null;
	const adjusted = list.items.map((item) => {
		const te = item.textEdit as { range?: { start: unknown; end: unknown } } | undefined;
		if (te && te.range) {
			te.range = {
				start: ctx.doc.positionAt(tpl.contentStart + htmlDoc.offsetAt(te.range.start as never)),
				end: ctx.doc.positionAt(tpl.contentStart + htmlDoc.offsetAt(te.range.end as never)),
			};
		}
		return item;
	});
	const seen = new Set<string>();
	return adjusted.filter((item) => {
		if (seen.has(item.label)) return false;
		seen.add(item.label);
		return true;
	});
}
