import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Diagnostic } from "vscode-languageserver/node";

import { taggedTemplates } from "../lib/templates";

function findHtmlAttributes(htmlText: string): { name: string; start: number; end: number }[] {
	const attributes: { name: string; start: number; end: number }[] = [];
	let index = 0;

	while (index < htmlText.length) {
		if (htmlText[index] !== "<") {
			index++;
			continue;
		}
		if (htmlText.startsWith("<!--", index)) {
			const commentEnd = htmlText.indexOf("-->", index + 4);
			index = commentEnd === -1 ? htmlText.length : commentEnd + 3;
			continue;
		}

		let cursor = index + 1;
		if (htmlText[cursor] === "/" || htmlText[cursor] === "!" || htmlText[cursor] === "?") {
			index++;
			continue;
		}
		if (!/[a-z]/i.test(htmlText[cursor] ?? "")) {
			index++;
			continue;
		}

		while (cursor < htmlText.length && !/[\s/>]/.test(htmlText[cursor]!)) cursor++;

		while (cursor < htmlText.length) {
			while (/\s/.test(htmlText[cursor] ?? "")) cursor++;
			if (htmlText[cursor] === ">") {
				index = cursor + 1;
				break;
			}
			if (htmlText[cursor] === "/" && htmlText[cursor + 1] === ">") {
				index = cursor + 2;
				break;
			}

			const start = cursor;
			while (cursor < htmlText.length && !/[\s=/>]/.test(htmlText[cursor]!)) cursor++;
			if (cursor === start) {
				cursor++;
				continue;
			}
			const name = htmlText.slice(start, cursor);
			while (/\s/.test(htmlText[cursor] ?? "")) cursor++;
			if (htmlText[cursor] === "=") {
				cursor++;
				while (/\s/.test(htmlText[cursor] ?? "")) cursor++;
				const quote =
					htmlText[cursor] === "'" || htmlText[cursor] === '"' ? htmlText[cursor] : null;
				if (quote) {
					cursor++;
					while (cursor < htmlText.length && htmlText[cursor] !== quote) cursor++;
					if (cursor < htmlText.length) cursor++;
				} else {
					while (cursor < htmlText.length && !/[\s>]/.test(htmlText[cursor]!)) cursor++;
				}
			}
			attributes.push({ name, start, end: cursor });
		}
		if (cursor >= htmlText.length) index = htmlText.length;
	}

	return attributes;
}

export async function validateDatastarAttributes(
	doc: TextDocument,
	htmlText: string,
	contentStart: number,
): Promise<any[]> {
	const diagnostics: any[] = [];

	const attrRe = /^data-([a-z-]+)(?::([a-zA-Z0-9_-]+))?(__[a-z]+(?:\.[a-z0-9]+)*)?$/;
	const validPlugins = [
		"on",
		"attr",
		"bind",
		"class",
		"computed",
		"effect",
		"ignore",
		"ignore-morph",
		"indicator",
		"init",
		"json-signals",
		"on-intersect",
		"on-interval",
		"on-raf",
		"on-resize",
		"on-signal-patch",
		"on-signal-patch-filter",
		"preserve-attr",
		"ref",
		"show",
		"signals",
		"style",
		"text",
		"animate",
		"custom-validity",
		"match-media",
		"persist",
		"query-string",
		"replace-url",
		"scroll-into-view",
		"view-transition",
		"nonce",
	];

	for (const attribute of findHtmlAttributes(htmlText)) {
		if (!attribute.name.startsWith("data-")) continue;
		const match = attrRe.exec(attribute.name);
		if (!match) continue;
		const plugin = match[1];
		const modifiers = match[3];

		// Validate plugin name
		if (!validPlugins.includes(plugin)) {
			const range = {
				start: doc.positionAt(contentStart + attribute.start),
				end: doc.positionAt(contentStart + attribute.end),
			};
			diagnostics.push({
				severity: 2,
				range,
				message: `Unknown DataStar plugin: "${plugin}". Valid plugins: ${validPlugins.join(", ")}`,
				source: "spacefn-datastar",
			});
		}

		// Validate modifier syntax
		if (modifiers) {
			const modParts = modifiers.split("__").filter(Boolean);
			const validModifiers = [
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
			for (const mod of modParts) {
				const modName = mod.split(".")[0];
				if (!validModifiers.includes(modName)) {
					const modStart = contentStart + attribute.start + attribute.name.indexOf(mod);
					const range = {
						start: doc.positionAt(modStart),
						end: doc.positionAt(modStart + mod.length),
					};
					diagnostics.push({
						severity: 2,
						range,
						message: `Unknown DataStar modifier: "${modName}". Valid modifiers: ${validModifiers.join(", ")}`,
						source: "spacefn-datastar",
					});
				}
			}
		}
	}

	return diagnostics;
}

export async function validateHtmlDatastar(doc: TextDocument): Promise<Diagnostic[]> {
	const text = doc.getText();
	const diagnostics: any[] = [];
	for (const tpl of taggedTemplates(text, ["html"])) {
		const htmlText = text.slice(tpl.contentStart, tpl.end);
		diagnostics.push(...(await validateDatastarAttributes(doc, htmlText, tpl.contentStart)));
	}
	return diagnostics;
}
