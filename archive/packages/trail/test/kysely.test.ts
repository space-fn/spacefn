import type { CompiledQuery, DatabaseConnection, Dialect, Driver, QueryResult } from "kysely";
import { describe, expect, it } from "vitest";

import { trailDialect } from "../src/kysely.js";
import { runWithTrail } from "../src/scope.js";
import { Trail } from "../src/trail.js";
import type { TrailBatch, Transport } from "../src/types.js";

function collector(): Transport & { batches: TrailBatch[] } {
	const batches: TrailBatch[] = [];
	return {
		batches,
		async send(batch) {
			batches.push(batch);
		},
	};
}

interface FakeDb {
	dialect: Dialect;
	driver: Driver;
	rawConnection: DatabaseConnection;
	log: { sql: string; connection?: unknown }[];
}

function fakeDb(options: { fail?: boolean } = {}): FakeDb {
	const log: FakeDb["log"] = [];
	const rawConnection: DatabaseConnection = {
		async executeQuery<R>(query): Promise<QueryResult<R>> {
			log.push({ sql: query.sql });
			if (options.fail) throw new Error("db down");
			// Fixture rows stand in for any driver row shape.
			const result = { rows: [{ id: 1 }, { id: 2 }] } as QueryResult<R>;
			return result;
		},
		async *streamQuery<R>(query) {
			log.push({ sql: query.sql });
			const result = { rows: [{ id: 1 }] } as QueryResult<R>;
			yield result;
		},
	};
	const driver: Driver = {
		async init() {},
		async destroy() {},
		async acquireConnection() {
			return rawConnection;
		},
		async beginTransaction(connection) {
			log.push({ sql: "begin", connection });
		},
		async commitTransaction() {},
		async rollbackTransaction() {},
		async releaseConnection() {},
	};
	const dialect: Dialect = {
		createDriver: () => driver,
		createAdapter: () => {
			throw new Error("unused in this test");
		},
		createQueryCompiler: () => {
			throw new Error("unused in this test");
		},
		createIntrospector: () => {
			throw new Error("unused in this test");
		},
	};
	return { dialect, driver, rawConnection, log };
}

// Minimal operation-node fixture: trailDialect only reads `query.query.kind`.
const SELECT_QUERY = {
	query: { kind: "SelectQueryNode" },
	queryId: {},
	sql: "select * from todos",
	parameters: [],
} as CompiledQuery;

describe("trailDialect", () => {
	it("records a db span under the ambient trail", async () => {
		const transport = collector();
		const trail = new Trail({ transport, now: () => 0 });
		const { dialect } = fakeDb();
		const driver = trailDialect(dialect).createDriver();

		await runWithTrail(trail, async () => {
			const connection = await driver.acquireConnection();
			await connection.executeQuery(SELECT_QUERY);
		});
		await trail.flush();

		const span = transport.batches[0].spans.find((s) => s.kind === "db");
		expect(span?.name).toBe("db.select");
		expect(span?.parentSpanId).toBe(trail.root.spanId);
		expect(span?.attributes).toMatchObject({
			"db.operation": "select",
			"db.sql": "select * from todos",
			"db.rows": 2,
		});
	});

	it("records failed queries as span errors and rethrows", async () => {
		const transport = collector();
		const trail = new Trail({ transport, now: () => 0 });
		const { dialect } = fakeDb({ fail: true });
		const driver = trailDialect(dialect).createDriver();

		await expect(
			runWithTrail(trail, async () => {
				const connection = await driver.acquireConnection();
				await connection.executeQuery(SELECT_QUERY);
			}),
		).rejects.toThrow("db down");
		await trail.flush();

		const [batch] = transport.batches;
		const span = batch.spans.find((s) => s.kind === "db");
		expect(span?.status).toBe("error");
		expect(batch.events[0]).toMatchObject({ message: "db down" });
	});

	it("spans streamed queries after iteration completes", async () => {
		const transport = collector();
		const trail = new Trail({ transport, now: () => 0 });
		const { dialect } = fakeDb();
		const driver = trailDialect(dialect).createDriver();

		await runWithTrail(trail, async () => {
			const connection = await driver.acquireConnection();
			const chunks = [];
			for await (const chunk of connection.streamQuery(SELECT_QUERY, 10)) chunks.push(chunk);
			expect(chunks).toHaveLength(1);
		});
		await trail.flush();

		const span = transport.batches[0].spans.find((s) => s.name === "db.select");
		expect(span?.attributes).toMatchObject({ "db.sql": "select * from todos" });
	});

	it("executes queries untouched when no trail is active", async () => {
		const { dialect } = fakeDb();
		const driver = trailDialect(dialect).createDriver();
		const connection = await driver.acquireConnection();

		const result = await connection.executeQuery(SELECT_QUERY);
		expect(result.rows).toHaveLength(2);
	});

	it("hands the raw connection to transaction control", async () => {
		const { dialect, driver, rawConnection, log } = fakeDb();
		const wrapped = trailDialect(dialect, {
			resolve: () => undefined,
		}).createDriver();
		const connection = await wrapped.acquireConnection();
		await wrapped.beginTransaction(connection, {});
		await wrapped.commitTransaction(connection, {});
		await wrapped.releaseConnection(connection);
		expect(log.find((entry) => entry.sql === "begin")?.connection).toBe(rawConnection);
		void driver;
	});

	it("honors an explicit trail resolver", async () => {
		const transport = collector();
		const trail = new Trail({ transport, now: () => 0 });
		const { dialect } = fakeDb();
		const driver = trailDialect(dialect, { resolve: () => trail }).createDriver();

		const connection = await driver.acquireConnection();
		await connection.executeQuery(SELECT_QUERY);
		await trail.flush();
		expect(transport.batches[0].spans.some((s) => s.kind === "db")).toBe(true);
	});
});
