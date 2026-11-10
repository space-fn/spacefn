import { describe, expect, test } from "vite-plus/test";
import * as cssService from "vscode-css-languageservice";
import * as htmlService from "vscode-html-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { CompletionItem } from "vscode-languageserver/node";

import { complete } from "./index";
import type { CompletionDeps } from "./types";

const deps: CompletionDeps = {
	htmlLS: htmlService.getLanguageService(),
	cssLS: cssService.getCSSLanguageService(),
	customProps: new Map([["--brand-color", "#f60"]]),
	getSchema: async () => ({ tables: [], columns: new Map() }),
	htmlService,
};

/** Completes at `|` in a .ts file and applies the chosen item the way VS Code would. */
async function accept(source: string, label: string): Promise<string> {
	const offset = source.indexOf("|");
	const text = source.replace("|", "");
	const doc = TextDocument.create("file:///a.ts", "typescript", 1, text);
	const items = (await complete(
		{ doc, text, offset, filePath: "/a.ts", isJsTs: true },
		deps,
		() => null,
	)) as CompletionItem[];
	const item = items.find((i) => i.label === label);
	if (!item) throw new Error(`no ${label} in ${items.map((i) => i.label).join(", ")}`);
	const te = item.textEdit as { range?: any; replace?: any; newText: string } | undefined;
	if (!te) throw new Error(`${label} has no textEdit; VS Code would guess the word to replace`);
	const range = te.range ?? te.replace;
	return TextDocument.applyEdits(doc, [{ range, newText: te.newText }]);
}

describe("completion edits keep what the user typed", () => {
	test("a $signal keeps its $", async () => {
		const src = 'html`<div data-signals:count="0"><b data-text="$co|"></b></div>`';
		expect(await accept(src, "$count")).toContain('data-text="$count"');
	});
	test("a __modifier replaces only the modifier", async () => {
		const src = 'html`<button data-on:click__deb|="x"></button>`';
		expect(await accept(src, "__debounce")).toContain("data-on:click__debounce=");
	});
	test("an @action keeps its @", async () => {
		const src = 'html`<button data-on:click="@ge|"></button>`';
		expect(await accept(src, "@get")).toContain("\"@get(${1:'/endpoint'})\"");
	});
	test("a CSS custom property is not doubled", async () => {
		const src = "css`a { color: var(--br|); }`";
		expect(await accept(src, "--brand-color")).toContain("var(--brand-color)");
	});
	test("a hyphenated CSS property replaces the whole name", async () => {
		const src = "css`a { background-co| }`";
		const out = await accept(src, "background-color");
		expect(out).toContain("{ background-color");
		expect(out).not.toContain("background-background");
	});
});
