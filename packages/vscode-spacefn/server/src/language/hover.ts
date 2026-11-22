import type { Hover, Position } from "vscode-languageserver/node";

import { resolveDbDir } from "../diagnostics/embedded";
import { cssRegionAt } from "../lib/cssRegions";
import { findHtmlTemplateRange, wordRangeAt } from "../lib/helpers";
import { qualifierBefore, resolveSymbol, scopesAt, statementAt } from "../lib/sqlScope";
import type { LanguageCtx, LanguageDeps, SchemaInfo } from "./types";

/** Hover for CSS/HTML/DataStar templates and SQL schema. */
export async function hover(ctx: LanguageCtx, deps: LanguageDeps): Promise<Hover | null> {
	const { cssLS, htmlLS, htmlService, getSchema, datastarDocs, datastarActionDocs } = deps;
	const text = ctx.text;
	const offset = ctx.offset;
	const filePath = ctx.filePath;
	const isJsTs = ctx.isJsTs;
	const tpl = isJsTs ? findHtmlTemplateRange(text, offset) : null;
	const css = isJsTs ? cssRegionAt(text, offset) : null;
	if (css) {
		const position = css.doc.positionAt(offset - css.start);
		const found = cssLS.doHover(css.doc, position, cssLS.parseStylesheet(css.doc));
		if (!found) return null;
		const toHost = (p: Position) => ctx.doc.positionAt(css.start + css.doc.offsetAt(p));
		const range = found.range && {
			start: toHost(found.range.start),
			end: toHost(found.range.end),
		};
		return { ...found, range } as Hover;
	}
	if (tpl && offset >= tpl.contentStart && offset <= tpl.end) {
		let htmlText = text.slice(tpl.contentStart, tpl.end);
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
		const pos = htmlDoc.positionAt(offset - tpl.contentStart);
		const htmlDocParsed = htmlLS.parseHTMLDocument(htmlDoc);
		const hover = htmlLS.doHover(htmlDoc, pos, htmlDocParsed);
		if (hover) return hover as any;
		// fallback: check if word is a DataStar attribute or action
		const wordRange2 = wordRangeAt(ctx.doc, ctx.position, /[a-zA-Z0-9_@:.-]+/);
		if (wordRange2) {
			const word2 = ctx.doc.getText(wordRange2);
			// check data-* attributes
			for (const [attr, info] of Object.entries(datastarDocs)) {
				if (word2.startsWith(attr)) {
					const modList = info.modifiers.length ? info.modifiers.join(", ") : "none";
					return {
						contents: {
							kind: "markdown",
							value: `**${attr}**\n\n${info.description}\n\n**Syntax:** \`${info.syntax}\`\n\n**Modifiers:** ${modList}`,
						},
						range: wordRange2,
					};
				}
			}
			// check @actions
			for (const [action, info] of Object.entries(datastarActionDocs)) {
				if (word2.startsWith(action)) {
					const optList = info.options.length ? info.options.join(", ") : "none";
					return {
						contents: {
							kind: "markdown",
							value: `**${action}**\n\n${info.description}\n\n**Syntax:** \`${info.syntax}\`\n\n**Options:** ${optList}`,
						},
						range: wordRange2,
					};
				}
			}
		}
		return hover as any;
	}
	const stmt = statementAt(text, offset, filePath.endsWith(".sql"));
	if (!stmt) return null;
	const resolved = resolveDbDir(filePath);
	if (!resolved) return null;
	let schema: SchemaInfo;
	try {
		schema = await getSchema(resolved.dbDir, resolved.targetDb);
	} catch {
		return null;
	}
	const wordRange = wordRangeAt(ctx.doc, ctx.position, /\w/);
	if (!wordRange) return null;
	const word = ctx.doc.getText(wordRange);
	const wordStart = ctx.doc.offsetAt(wordRange.start);
	const scopes = scopesAt(stmt.sql, wordStart - stmt.start);
	const symbol = resolveSymbol(schema, scopes, word, qualifierBefore(text, wordStart));
	if (!symbol) return null;
	if (symbol.kind === "table") {
		const cols = schema.columns.get(symbol.table) ?? [];
		const colList = cols
			.map((c) => `- ${c.pk ? "🔑 " : ""}\`${c.name}\` ${c.type}${c.notnull ? " NOT NULL" : ""}`)
			.join("\n");
		return {
			contents: { kind: "markdown", value: `**table** \`${symbol.table}\`\n\n${colList}` },
			range: wordRange,
		};
	}
	const value = symbol.matches
		.map(({ table, column: col }) => {
			const flags = [col.pk ? "PK" : "", col.notnull ? "NOT NULL" : "nullable"]
				.filter(Boolean)
				.join(" · ");
			const def = col.defaultValue != null ? ` · DEFAULT ${col.defaultValue}` : "";
			return `**column** \`${table}.${col.name}\` : ${col.type} · ${flags}${def}`;
		})
		.join("\n\n");
	// SQL rejects this reference; say how to write it instead.
	const fixes = symbol.matches.map((m) => `\`${m.alias ?? m.table}.${m.column.name}\``);
	const ambiguous = symbol.ambiguous
		? `\n\n⚠️ Ambiguous: \`${word}\` is in more than one table here. Write ${fixes.join(" or ")}.`
		: "";
	return { contents: { kind: "markdown", value: value + ambiguous }, range: wordRange };
}
