import { describe, expect, test } from "vite-plus/test";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { LanguageDeps, SchemaInfo } from "./types";

const schema: SchemaInfo = {
	tables: ["users"],
	columns: new Map([["users", [{ name: "id", type: "integer" }]]]),
};

function makeDeps(): LanguageDeps {
	return {
		htmlLS: {} as LanguageDeps["htmlLS"],
		cssLS: {} as LanguageDeps["cssLS"],
		htmlService: {} as LanguageDeps["htmlService"],
		getSchema: async () => schema,
		datastarDocs: {},
		datastarActionDocs: {},
		readDir: async () => [],
		readFile: async () => "",
		joinPath: (...p) => p.join("/"),
	};
}

describe("LanguageDeps contract", () => {
	test("schema injected", async () => {
		const deps = makeDeps();
		const s = await deps.getSchema("a", "b");
		expect(s.tables).toContain("users");
	});
	test("fs injection works", async () => {
		const deps = makeDeps();
		expect(await deps.readDir("/x")).toEqual([]);
		expect(deps.joinPath("a", "b")).toBe("a/b");
	});
});
