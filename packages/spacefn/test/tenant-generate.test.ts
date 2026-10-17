import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, expect, test } from "vitest";

import type { Migration } from "../src/db";
import { analyzeQueries } from "../src/db/build-queries";
import { generateTenantSource } from "../src/db/generate-tenant";
import { generateWorkerSource } from "../src/entry";
import { sync } from "../src/sync";
import {
	exportTenantData,
	migrateTenant,
	queryTenant,
	wipeTenantData,
	type DurableStorageLike,
} from "../src/tenancy";

const migrations: Migration[] = [
	{
		id: "0001_todos",
		sql: "CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0);",
	},
];

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "space-tenant-"));
	await mkdir(join(root, "app", "tenant", "migrations"), { recursive: true });
	await mkdir(join(root, "app", "tenant", "queries"), { recursive: true });
	await writeFile(
		join(root, "app", "tenant", "migrations", "0001_todos.sql"),
		migrations[0]?.sql ?? "",
	);
});

afterEach(() => rm(root, { recursive: true, force: true }));

async function generate(queries: Record<string, string>) {
	for (const [name, body] of Object.entries(queries)) {
		await writeFile(join(root, "app", "tenant", "queries", `${name}.sql`), body);
	}
	return generateTenantSource(
		await analyzeQueries(join(root, "app", "tenant", "queries"), migrations),
		migrations,
	);
}

test("the Tenant class migrates before serving and exposes each query as a method", async () => {
	const source = await generate({
		find: "-- name: findTodo :one\n-- @param id number\nSELECT id, title, done FROM todos WHERE id = :id",
		list: "-- name: listTodos :many\nSELECT id, title FROM todos ORDER BY id",
		add: "-- name: addTodo :exec\n-- @param title string\nINSERT INTO todos (title) VALUES (:title)",
	});
	expect(source).toContain('import { DurableObject } from "cloudflare:workers";');
	expect(source).toContain("export class Tenant extends DurableObject {");
	expect(source).toContain(
		"ctx.blockConcurrencyWhile(() => migrateTenant(ctx.storage, migrations));",
	);
	expect(source).toContain('{ id: "0001_todos", sql:');
	expect(source).toContain(
		"async findTodo(params: { id: number }): Promise<FindTodoRow | undefined> {",
	);
	expect(source).toContain(
		'return queryTenant<FindTodoRow>(this.ctx.storage, "SELECT id, title, done FROM todos WHERE id = ?", [params.id])[0];',
	);
	expect(source).toContain(
		"async listTodos(params: Record<string, never>): Promise<ListTodosRow[]> {",
	);
	expect(source).toContain("async addTodo(params: { title: string }): Promise<void> {");
});

test("a query may not shadow a Durable Object method", async () => {
	await expect(generate({ fetch: "-- name: fetch :many\nSELECT id FROM todos" })).rejects.toThrow(
		"clashes with a Durable Object method",
	);
});

test("the worker entry exports Tenant only for a tenant project", () => {
	expect(generateWorkerSource({})).not.toContain("Tenant");
	expect(generateWorkerSource({ tenant: true })).toContain('export { Tenant } from "./tenant";');
});

test("sync writes .space/tenant.ts for a tenant folder", async () => {
	await generate({ list: "-- name: listTodos :many\nSELECT id FROM todos" });
	await sync(root, "dev");
	expect(await readFile(join(root, ".space", "tenant.ts"), "utf8")).toContain(
		"export class Tenant",
	);
	expect(await readFile(join(root, ".space", "worker.ts"), "utf8")).toContain(
		'export { Tenant } from "./tenant";',
	);
});

/** The shape of a Durable Object's SQLite storage, over node:sqlite. */
function storage(db: DatabaseSync): DurableStorageLike {
	return {
		sql: {
			exec: (sql: string, ...params: unknown[]) => {
				const rows = db.prepare(sql).all(...(params as never[]));
				return { toArray: () => rows };
			},
		},
		deleteAll: async () => {
			for (const { name } of db
				.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
				.all() as { name: string }[]) {
				db.exec(`DROP TABLE "${name}"`);
			}
		},
		transactionSync: <T>(fn: () => T): T => {
			db.exec("BEGIN");
			try {
				const result = fn();
				db.exec("COMMIT");
				return result;
			} catch (error) {
				db.exec("ROLLBACK");
				throw error;
			}
		},
	};
}

test("tenant storage migrates once and keeps each tenant's data apart", async () => {
	const acme = new DatabaseSync(":memory:");
	const beta = new DatabaseSync(":memory:");
	expect(await migrateTenant(storage(acme), migrations)).toEqual(["0001_todos"]);
	expect(await migrateTenant(storage(acme), migrations)).toEqual([]);
	await migrateTenant(storage(beta), migrations);

	storage(acme).sql.exec("INSERT INTO todos (title) VALUES ('acme only')");
	expect(queryTenant<{ title: string }>(storage(beta), "SELECT title FROM todos", [])).toEqual([]);
	expect(queryTenant<{ title: string }>(storage(acme), "SELECT title FROM todos", [])).toEqual([
		{ title: "acme only" },
	]);
});

test("export reads every user table as JSON, including the ledger", async () => {
	const db = new DatabaseSync(":memory:");
	await migrateTenant(storage(db), migrations);
	storage(db).sql.exec("INSERT INTO todos (title) VALUES ('keep me')");
	const dump = exportTenantData(storage(db), new Date("2026-01-02T03:04:05Z"));
	expect(dump.exportedAt).toBe("2026-01-02T03:04:05.000Z");
	expect(dump.tables.map((t) => t.name)).toEqual(["space_migrations", "todos"]);
	expect(dump.tables.find((t) => t.name === "todos")?.rows).toEqual([
		{ id: 1, title: "keep me", done: 0 },
	]);
});

test("wipe erases the tenant, and a later export is empty", async () => {
	const db = new DatabaseSync(":memory:");
	await migrateTenant(storage(db), migrations);
	storage(db).sql.exec("INSERT INTO todos (title) VALUES ('gone soon')");
	await wipeTenantData(storage(db));
	expect(exportTenantData(storage(db), new Date()).tables).toEqual([]);
});

test("the generated class exposes export and wipe, and they cannot be shadowed", async () => {
	const source = await generate({ list: "-- name: listTodos :many\nSELECT id FROM todos" });
	expect(source).toContain("exportData(): TenantDump {");
	expect(source).toContain("wipe(): Promise<void> {");
	await expect(generate({ wipe: "-- name: wipe :exec\nDELETE FROM todos" })).rejects.toThrow(
		"clashes",
	);
});
