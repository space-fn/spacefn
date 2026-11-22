import { describe, expect, test } from "vitest";
import * as cssService from "vscode-css-languageservice";
import * as htmlService from "vscode-html-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { CompletionItem } from "vscode-languageserver/node";

import { complete, type CompletionDeps } from "../completion";
import { validateCss } from "../diagnostics/css";
import { hover } from "../language/hover";
import type { LanguageDeps } from "../language/types";

const deps: CompletionDeps = {
	htmlLS: htmlService.getLanguageService(),
	cssLS: cssService.getCSSLanguageService(),
	customProps: new Map([["--brand-color", "#f60"]]),
	getSchema: async () => ({ tables: [], columns: new Map() }),
	htmlService,
};

/** The ways to write CSS in a .ts file. */
const embeddings = [
	["css template", (css: string) => `const s = css\`${css}\`;`],
	["<style> tag", (css: string) => `const v = html\`<p>hi</p><style>${css}</style><p>bye</p>\`;`],
] as const;

const document = (text: string) => TextDocument.create("file:///a.ts", "typescript", 1, text);

/** The file without its `|`, and the context at that spot. */
function at(source: string) {
	const offset = source.indexOf("|");
	const text = source.replace("|", "");
	const doc = document(text);
	const position = doc.positionAt(offset);
	return { doc, text, offset, position, filePath: "/a.ts", isJsTs: true };
}

async function problems(text: string) {
	return (await validateCss(document(text))).map((d) => d.message);
}

async function items(source: string) {
	return ((await complete(at(source), deps, () => null)) ?? []) as CompletionItem[];
}

async function accept(source: string, label: string) {
	const item = (await items(source)).find((i) => i.label === label);
	const edit = item?.textEdit as any;
	return TextDocument.applyEdits(at(source).doc, [
		{ range: edit.replace ?? edit.range, newText: edit.newText },
	]);
}

describe.each(embeddings)("CSS in a %s", (_, wrap) => {
	test.each([
		".a { color: ${color}; }",
		".a { width: ${size}px; height: ${size}%; }",
		".a { color: #${hex}; }",
		".a { margin: calc(${gap} * 2) }",
		".a { ${decls} }",
		".a {\n\t${decls}\n\tmargin: 0;\n}",
		".a { ${prop}: red; margin-${side}: 0; }",
		".${name} { color: red; }",
		"${selector},\n.b { color: red; }",
		"${selector}\n{ color: red; }",
		"${rules}\n.b { color: red; }",
		"@media (min-width: ${bp}) { p { color: red; } }",
		".a { color: ${pick({ dark: { text: 1 } })}; }",
		".a { color: ${pick(\n\ttheme,\n)}; }",
	])("accepts %j", async (css) => {
		expect(await problems(wrap(css))).toEqual([]);
	});

	test("still reports what is wrong around a ${}", async () => {
		const found = await problems(wrap(".a { colr: red; width: ${size}; }\n.b { }"));
		expect(found).toEqual(["Unknown property: 'colr'", "Do not use empty rulesets"]);
	});

	test("a problem's range is in the host file", async () => {
		const doc = document(wrap("\n\t.a { color: ${c};\n\t\tcolr: red; }"));
		const [found] = await validateCss(doc);
		expect(doc.getText(found!.range)).toBe("colr");
	});

	test("completes a property and replaces all of it", async () => {
		const out = await accept(wrap("\n\t.a { background-co| }"), "background-color");
		expect(out).toContain("{ background-color: ");
	});

	test("completes a value", async () => {
		expect(await accept(wrap(".a { display: gr| }"), "grid")).toContain("display: grid");
	});

	test("a hyphen inside a name doesn't start a custom property", async () => {
		const labels = (await items(wrap(".a { background-| }"))).map((i) => i.label);
		expect(labels).toContain("background-color");
	});

	test("a hyphen that starts a name does", async () => {
		const out = await accept(wrap(".a { color: var(-|); }"), "--brand-color");
		expect(out).toContain("var(--brand-color)");
	});

	test("an edit leaves the ${} after it", async () => {
		const out = await accept(wrap(".a { color: re|${tail}; }"), "red");
		expect(out).toContain("red${tail}");
	});

	test("an edit leaves the ${} before it", async () => {
		const out = await accept(wrap(".a { color: ${head}re|; }"), "red");
		expect(out).toContain("${head}red");
	});

	test("no CSS inside a ${}", async () => {
		const labels = (await items(wrap(".a { color: ${re|}; }"))).map((i) => i.label);
		expect(labels).not.toContain("red");
	});

	test("hover explains the property under the cursor", async () => {
		const ctx = at(wrap("\n\t.a { dis|play: grid; }"));
		const found = await hover(ctx, deps as unknown as LanguageDeps);
		expect(JSON.stringify(found?.contents)).toContain("display");
		expect(ctx.doc.getText(found!.range)).toContain("display");
		expect(ctx.doc.getText(found!.range)).not.toContain("const");
	});
});

describe("which <style> tags are CSS", () => {
	const bad = ".a { colr: red; }";
	const unknown = ["Unknown property: 'colr'"];

	test.each([
		`html\`<style>${bad}</style>\``,
		`html\`<STYLE media="print">${bad}</STYLE>\``,
		`html\`<style type="text/css">${bad}</style>\``,
		`html\`<style nonce="\${a > b ? x : y}">${bad}</style>\``,
		`html\`<ul>\${xs.map(() => html\`<style>${bad}</style>\`)}</ul>\``,
		`render: ({ html }) => html\`\n<style>\n${bad}\n</style>\``,
		`html\`<style>${bad}\``,
	])("checks %j", async (source) => {
		expect(await problems(source)).toEqual(unknown);
	});

	test.each([
		`html\`<!-- <style>${bad}</style> -->\``,
		`html\`<script>const s = "<style>${bad}</style>";</script>\``,
		`html\`<style type="text/tailwindcss">${bad}</style>\``,
		`html\`<p title="<style>">${bad}</p>\``,
		`html\`<p>\${"<style>"}${bad}</p>\``,
		`const s = "<style>${bad}</style>";`,
		`// html\`<style>${bad}</style>\``,
		`other\`<style>${bad}</style>\``,
	])("skips %j", async (source) => {
		expect(await problems(source)).toEqual([]);
	});

	test("checks each tag of a template", async () => {
		const source = `html\`<style>${bad}</style><p></p><style>${bad}</style>\``;
		expect(await problems(source)).toEqual([...unknown, ...unknown]);
	});

	test("an empty tag completes", async () => {
		const labels = (await items("html`<style>|</style>`")).map((i) => i.label);
		expect(labels).toContain("@media");
	});

	test("a closing tag being typed isn't CSS", async () => {
		expect(await problems("html`<style>.a { color: red; }</sty`")).toEqual([]);
	});

	test("markup outside the tag isn't CSS", async () => {
		const labels = (await items("html`<style></style><p |></p>`")).map((i) => i.label);
		expect(labels).not.toContain("@media");
	});

	test("a css template inside a <style> is checked once", async () => {
		const source = `html\`<style>\${css\`${bad}\`}</style>\``;
		expect(await problems(source)).toEqual(unknown);
	});
});
