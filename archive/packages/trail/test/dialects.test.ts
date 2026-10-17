import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Kysely, sql } from "kysely";
import { D1Dialect } from "kysely-d1";
import { LibsqlDialect } from "kysely-libsql";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { trailDialect } from "../src/kysely.js";
import { runWithTrail } from "../src/scope.js";
import { Trail } from "../src/trail.js";
import type { TrailBatch, Transport } from "../src/types.js";

interface TestDb {
	todos: { id: number; title: string };
}

function collector(): Transport & { batches: TrailBatch[] } {
	const batches: TrailBatch[] = [];
	return {
		batches,
		async send(batch) {
			batches.push(batch);
		},
	};
}

async function createSchema(db: Kysely<TestDb>): Promise<void> {
	await db.schema
		.createTable("todos")
		.addColumn("id", "integer", (c) => c.primaryKey())
		.addColumn("title", "text", (c) => c.notNull())
		.execute();
}

async function crud(db: Kysely<TestDb>): Promise<void> {
	await db.deleteFrom("todos").execute();
	await db.insertInto("todos").values({ title: "one" }).execute();
	await db.insertInto("todos").values({ title: "two" }).execute();
	await db.updateTable("todos").set({ title: "won" }).where("title", "=", "one").execute();
	await db.deleteFrom("todos").where("title", "=", "two").execute();
	const rows = await db.selectFrom("todos").selectAll().execute();
	expect(rows.map((r) => r.title)).toEqual(["won"]);
}

describe("kysely-libsql (file-backed, as the playground uses)", () => {
	const dbFile = join(tmpdir(), `trail-libsql-${process.pid}.db`);
	let db: Kysely<TestDb>;

	beforeAll(async () => {
		db = new Kysely<TestDb>({
			dialect: trailDialect(new LibsqlDialect({ url: `file:${dbFile}` })),
		});
		await createSchema(db);
	});

	afterAll(async () => {
		await db.destroy();
		rmSync(dbFile, { force: true });
	});

	it("runs CRUD with correct results", async () => {
		await crud(db);
	});

	it("keeps transaction commit and rollback semantics", async () => {
		await db.transaction().execute(async (trx) => {
			await trx.insertInto("todos").values({ title: "committed" }).execute();
		});
		await expect(
			db.transaction().execute(async (trx) => {
				await trx.insertInto("todos").values({ title: "ghost" }).execute();
				throw new Error("abort");
			}),
		).rejects.toThrow("abort");

		const titles = (await db.selectFrom("todos").selectAll().execute()).map((r) => r.title);
		expect(titles).toContain("committed");
		expect(titles).not.toContain("ghost");
	});

	it("forwards introspection", async () => {
		const tables = await db.introspection.getTables();
		expect(tables.some((table) => table.name === "todos")).toBe(true);
	});

	it("records db spans under the ambient trail", async () => {
		const transport = collector();
		const trail = new Trail({ transport, now: () => 0 });
		await runWithTrail(trail, () => crud(db));
		await trail.flush();

		const spans = transport.batches[0].spans.filter((s) => s.kind === "db");
		expect(spans.some((s) => s.name === "db.insert")).toBe(true);
		expect(spans.some((s) => s.name === "db.select")).toBe(true);
		expect(spans.every((s) => s.traceId === trail.traceId)).toBe(true);
	});

	it("records failed queries and rethrows", async () => {
		const transport = collector();
		const trail = new Trail({ transport, now: () => 0 });
		await runWithTrail(trail, async () => {
			await expect(sql`select * from missing_table`.execute(db)).rejects.toThrow();
		});
		await trail.flush();

		const failed = transport.batches[0].spans.find((s) => s.status === "error");
		expect(failed?.kind).toBe("db");
	});

	it("reports unsupported streaming exactly like the raw dialect", async () => {
		const iterator = db.selectFrom("todos").selectAll().stream();
		await expect(iterator.next()).rejects.toThrow("does not support streaming");
	});
});

describe("kysely-d1 (real D1 via miniflare)", () => {
	let mf: Miniflare;
	let db: Kysely<TestDb>;
	let raw: Kysely<TestDb>;

	beforeAll(async () => {
		mf = new Miniflare({
			modules: true,
			script: "export default { fetch: () => new Response('ok') }",
			d1Databases: { DB: "trail-dialect-test" },
		});
		const d1 = await mf.getD1Database("DB");
		db = new Kysely<TestDb>({ dialect: trailDialect(new D1Dialect({ database: d1 })) });
		raw = new Kysely<TestDb>({ dialect: new D1Dialect({ database: d1 }) });
		await createSchema(db);
	}, 60_000);

	afterAll(async () => {
		await db.destroy();
		await mf.dispose();
	});

	it("runs CRUD with correct results", async () => {
		await crud(db);
	});

	it("records db spans under the ambient trail", async () => {
		const transport = collector();
		const trail = new Trail({ transport, now: () => 0 });
		await runWithTrail(trail, () => crud(db));
		await trail.flush();

		const spans = transport.batches[0].spans.filter((s) => s.kind === "db");
		expect(spans.some((s) => s.name === "db.select")).toBe(true);
		expect(spans.every((s) => s.traceId === trail.traceId)).toBe(true);
	});

	it("preserves the unsupported-transaction error of kysely-d1", async () => {
		await expect(raw.transaction().execute(() => Promise.resolve())).rejects.toThrow(
			"Transactions are not supported yet.",
		);
		await expect(db.transaction().execute(() => Promise.resolve())).rejects.toThrow(
			"Transactions are not supported yet.",
		);
	});

	it("preserves the unsupported-streaming error of kysely-d1", async () => {
		const iterator = db.selectFrom("todos").selectAll().stream();
		await expect(iterator.next()).rejects.toThrow("does not support streaming");
	});
});
