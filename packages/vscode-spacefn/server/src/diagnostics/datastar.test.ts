import { describe, expect, test } from "vite-plus/test";
import { TextDocument } from "vscode-languageserver-textdocument";

import { validateHtmlDatastar } from "./datastar";

describe("validateHtmlDatastar", () => {
	test("ignores DataStar-looking text in ordinary attribute values", async () => {
		const source = 'const view = html`<div class="data-table" title="data-unknown"></div>`;';
		const doc = TextDocument.create("file:///view.ts", "typescript", 1, source);

		expect(await validateHtmlDatastar(doc)).toEqual([]);
	});

	test("validates actual DataStar attribute names", async () => {
		const source = 'const view = html`<div data-table="value"></div>`;';
		const doc = TextDocument.create("file:///view.ts", "typescript", 1, source);

		const diagnostics = await validateHtmlDatastar(doc);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.message).toContain('Unknown DataStar plugin: "table"');
	});

	test("handles an unfinished tag while editing", async () => {
		const source = 'const view = html`<div class="data-table"';
		const doc = TextDocument.create("file:///view.ts", "typescript", 1, source);

		expect(await validateHtmlDatastar(doc)).toEqual([]);
	});
});
