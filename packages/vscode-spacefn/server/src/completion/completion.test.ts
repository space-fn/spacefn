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

describe("sqlCompletions with a schema", () => {
	const col = (name: string) => ({ name, type: "TEXT" });
	const deps = {
		htmlLS: {} as CompletionDeps["htmlLS"],
		cssLS: {} as CompletionDeps["cssLS"],
		customProps: new Map(),
		getSchema: async () => ({
			tables: ["users", "todos"],
			columns: new Map([
				["users", [col("id"), col("email")]],
				["todos", [col("id"), col("title")]],
			]),
		}),
		htmlService: {} as CompletionDeps["htmlService"],
	} satisfies CompletionDeps;
	const labels = async (source: string) => {
		const offset = source.indexOf("|");
		const text = source.replace("|", "");
		const items = await sqlCompletions(
			deps,
			{ filePath: "/app/db/main/queries/q.sql", text, offset },
			() => ({ dbDir: "/app/db/main", targetDb: "/app/db/main" }),
		);
		return items!.filter((i) => i.kind === 5).map((i) => i.insertText ?? i.label);
	};

	test("a column two joined tables share is offered qualified, one per table", async () => {
		expect(await labels("SELECT i| FROM users u JOIN todos t ON t.id = u.id")).toEqual([
			"u.id",
			"t.id",
		]);
	});
	test("a column only one table has stays bare", async () => {
		expect(await labels("SELECT ti| FROM users u JOIN todos t")).toEqual(["title"]);
	});
	test("USING keeps the shared column bare", async () => {
		expect(await labels("SELECT i| FROM users JOIN todos USING (id)")).toEqual(["id"]);
	});
});
