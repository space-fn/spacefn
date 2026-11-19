import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findAppRoot, importedDb, resolveDb } from "./project";

let root: string;
const at = (file: string, body = "") => {
	const full = path.join(root, file);
	mkdirSync(path.dirname(full), { recursive: true });
	writeFileSync(full, body);
	return full;
};

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), "spacefn-vscode-"));
	at("configs/space.ts", 'export default defineSpace({ target: "bun" });');
	mkdirSync(path.join(root, "app/db/main/migrations"), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("resolveDb", () => {
	it("finds the app root from configs/space.ts", () => {
		expect(findAppRoot(at("app/routes/users/[id].ts"))).toBe(root);
		expect(findAppRoot(path.join(tmpdir(), "elsewhere", "x.ts"))).toBeNull();
	});

	it("uses the database whose queries/ holds the file", () => {
		mkdirSync(path.join(root, "app/db/audit"), { recursive: true });
		expect(resolveDb(at("app/db/audit/queries/list.sql"))?.targetDb).toBe(
			path.join(root, "app/db/audit"),
		);
	});

	it("uses the only database for any app file, skipping _drafts", () => {
		mkdirSync(path.join(root, "app/db/_draft"), { recursive: true });
		expect(resolveDb(at("app/routes/index.ts"))).toEqual({
			dbDir: path.join(root, "app/db"),
			targetDb: path.join(root, "app/db/main"),
		});
	});

	it("follows the @space/db import when there are several", () => {
		mkdirSync(path.join(root, "app/db/audit"), { recursive: true });
		const file = at("lib/report.ts");
		expect(resolveDb(file, "")).toBeNull();
		expect(resolveDb(file, 'import AuditDb from "@space/db/audit.ts";')?.targetDb).toBe(
			path.join(root, "app/db/audit"),
		);
		expect(importedDb("import x from '@space/db/main';")).toBe("main");
		expect(importedDb('import x from "@space/assets";')).toBeNull();
	});
});

describe("embedded SQL in app files", () => {
	it("checks sql`` templates against the database, but not ones built with sql()", async () => {
		const { TextDocument } = await import("vscode-languageserver-textdocument");
		const { validateEmbedded } = await import("../diagnostics/embedded");
		at(
			"app/db/main/migrations/0001_todos.sql",
			"-- up\nCREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT);",
		);
		const file = at("app/routes/todos.ts");
		const check = (source: string) =>
			validateEmbedded(TextDocument.create(`file://${file}`, "typescript", 1, source));
		expect(await check("sql`SELECT title FROM todos WHERE id = ${id}`")).toEqual([]);
		const [bad] = await check("sql`SELECT nope FROM todos`");
		expect(bad?.message).toContain("nope");
		expect(await check('sql`SELECT * FROM ${sql("todos")} WHERE id IN ${sql.in(ids)}`')).toEqual(
			[],
		);
	});
});
