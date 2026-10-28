import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Diagnostic } from "vscode-languageserver/node";

export async function validateDatastarAttributes(
	doc: TextDocument,
	htmlText: string,
	contentStart: number,
): Promise<any[]> {
	const diagnostics: any[] = [];

	// Check for invalid attribute syntax
	const attrRe = /data-([a-z-]+)(?::([a-zA-Z0-9_-]+))?(__[a-z]+(?:\.[a-z0-9]+)*)?(?:="([^"]*)")?/g;
	let m;
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

	while ((m = attrRe.exec(htmlText)) !== null) {
		const plugin = m[1];
		const modifiers = m[3];

		// Validate plugin name
		if (!validPlugins.includes(plugin)) {
			const range = {
				start: doc.positionAt(contentStart + m.index),
				end: doc.positionAt(contentStart + m.index + m[0].length),
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
					const modStart = contentStart + m.index + m[0].indexOf(mod);
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
	const re = /\bhtml\s*`/g;
	let m;
	while ((m = re.exec(text)) !== null) {
		const contentStart = m.index + m[0].length;
		let i = contentStart;
		let depth = 0;
		let end = -1;
		while (i < text.length) {
			const ch = text[i];
			if (ch === "`" && depth === 0) {
				end = i;
				break;
			}
			if (ch === "$" && text[i + 1] === "{") {
				let d = 1;
				let j = i + 2;
				while (j < text.length && d > 0) {
					if (text[j] === "{") d++;
					else if (text[j] === "}") d--;
					j++;
				}
				i = j;
				continue;
			}
			i++;
		}
		if (end === -1) break;
		const htmlText = text.slice(contentStart, end);
		const htmlDiags = await validateDatastarAttributes(doc, htmlText, contentStart);
		diagnostics.push(...htmlDiags);
		re.lastIndex = end + 1;
	}
	return diagnostics;
}
