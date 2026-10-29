import { describe, expect, test } from "vite-plus/test";

import { sqlCompletions } from "./sql";
import { sqlDirectiveCompletions } from "./sqlDirectives";
import type { CompletionDeps, SchemaInfo } from "./types";

const findSqlTemplate = () => null;

describe("sqlDirectiveCompletions", () => {
	test("offers directive keywords after --", () => {
		const text = "-- name:";
		const items = sqlDirectiveCompletions(
			{ text, offset: text.length, isSqlFile: true, isJsTs: false },
			null,
			findSqlTemplate,
		);
		expect(items).not.toBeNull();
		expect(items!.some((i) => i.label.includes("name"))).toBe(true);
	});

	test("offers query modes after name:", () => {
		const text = "-- name: :";
		const items = sqlDirectiveCompletions(
			{ text, offset: text.length, isSqlFile: true, isJsTs: false },
			null,
			findSqlTemplate,
		);
		expect(items!.some((i) => i.label === ":one")).toBe(true);
	});

	test("returns null outside directive", () => {
		const text = "SELECT 1";
		const items = sqlDirectiveCompletions(
			{ text, offset: text.length, isSqlFile: true, isJsTs: false },
			null,
			findSqlTemplate,
		);
		expect(items).toBeNull();
	});
});

describe("sqlCompletions", () => {
	test("offers SQL keywords outside a project database", async () => {
		const deps = {
			htmlLS: {} as CompletionDeps["htmlLS"],
			cssLS: {} as CompletionDeps["cssLS"],
			customProps: new Map(),
			getSchema: async () => {
				throw new Error("schema should not be requested");
			},
			htmlService: {} as CompletionDeps["htmlService"],
		} satisfies CompletionDeps;
		const text = "SEL";
		const items = await sqlCompletions(
			deps,
			{ filePath: "/tmp/query.sql", text, offset: text.length },
			() => null,
		);

		expect(items?.some((item) => item.label === "SELECT")).toBe(true);
	});
});

describe("CompletionDeps contract", () => {
	test("injected deps shape", () => {
		const schema: SchemaInfo = { tables: ["users"], columns: new Map() };
		const deps: CompletionDeps = {
			htmlLS: {} as CompletionDeps["htmlLS"],
			cssLS: {} as CompletionDeps["cssLS"],
			customProps: new Map(),
			getSchema: async () => schema,
			htmlService: {} as CompletionDeps["htmlService"],
		};
		expect(typeof deps.getSchema).toBe("function");
	});
});
