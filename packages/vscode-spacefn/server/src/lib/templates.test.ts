import { describe, expect, test } from "vite-plus/test";

import { taggedTemplates } from "./templates";

describe("taggedTemplates", () => {
	test("ignores tags mentioned in comments and strings", () => {
		const text = "/** a `css` template */\n// html`x`\nconst s = 'sql`y`';\nconst c = css`a{}`;";
		const found = taggedTemplates(text, ["css", "html", "sql"]);
		expect(found.map((t) => text.slice(t.contentStart, t.end))).toEqual(["a{}"]);
	});
	test("finds templates nested in ${}", () => {
		const text = "html`<ul>${xs.map((x) => html`<li>${x}</li>`)}</ul>`";
		const found = taggedTemplates(text, ["html"]);
		expect(found).toHaveLength(2);
		expect(text.slice(found[1]!.contentStart, found[1]!.end)).toBe("<li>${x}</li>");
	});
});
