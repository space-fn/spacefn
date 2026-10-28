import { describe, expect, test } from "vite-plus/test";

import { findHtmlTemplateRange, findCssTemplateRange, findSqlTemplateRange } from "./helpers";

function genLargeFile(n: number): string {
	let s = "";
	for (let i = 0; i < n; i++) {
		s += `const h${i} = html\`<div data-signals="{count${i}: 0}"><span data-bind:text="count${i}">${"${x" + i + "}"}</span></div>\`;\n`;
		s += `const c${i} = css\`.box${i} { color: red; padding: 4px; }\`;\n`;
		s += `const q${i} = sql\`SELECT * FROM users WHERE id = :id${i}\`;\n`;
	}
	return s;
}

describe("range finder performance", () => {
	test("large file finds ranges quickly", () => {
		const text = genLargeFile(200);
		let total = 0;
		for (let i = 0; i < 30; i++) {
			const offset = Math.floor(text.length * (i / 30));
			const t0 = performance.now();
			findHtmlTemplateRange(text, offset);
			findCssTemplateRange(text, offset);
			findSqlTemplateRange(text, offset);
			total += performance.now() - t0;
		}
		const avg = total / 30;
		process.stdout.write(`avg range-find time: ${avg.toFixed(2)}ms on ${text.length} bytes\n`);
		// budget: each full validation pass should be well under 50ms
		expect(avg).toBeLessThan(50);
	});
});
