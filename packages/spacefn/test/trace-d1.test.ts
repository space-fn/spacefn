import { afterEach, expect, test } from "vite-plus/test";

import { setTracer, traceBindings, traceD1, type D1Like, type SpanRecord } from "../src/trace";

const records: SpanRecord[] = [];

afterEach(() => {
  setTracer(undefined);
  records.length = 0;
});

function fakeDb(): D1Like & { calls: string[] } {
  const calls: string[] = [];
  const statement = (sql: string) => {
    const self = {
      bind: (...values: unknown[]) => {
        calls.push(`bind:${values.join(",")}`);
        return self;
      },
      first: async () => ({ id: 1 }),
      run: async () => ({ meta: { rows_written: 1 } }),
      all: async () => ({ results: [{ id: 1 }, { id: 2 }], meta: { rows_read: 2 } }),
      raw: async () => [[1]],
      sql,
    };
    return self;
  };
  return {
    calls,
    prepare: (sql) => statement(sql) as never,
    batch: async (statements) => statements.map(() => ({ meta: {} })) as never,
    exec: async (sql) => {
      calls.push(`exec:${sql}`);
      return { count: 1 };
    },
  };
}

function capture() {
  setTracer({ onEnd: (record) => records.push(record) });
}

test("traces a prepared query with its operation, text and rows", async () => {
  capture();
  const db = traceD1(fakeDb());
  const rows = await db.prepare("SELECT * FROM todos WHERE id = ?").bind(1).all();
  expect(rows.results).toHaveLength(2);
  expect(records[0]).toMatchObject({
    name: "db.query",
    attributes: {
      "db.system": "d1",
      "db.operation.name": "all",
      "db.query.text": "SELECT * FROM todos WHERE id = ?",
      "db.rows_read": 2,
    },
  });
});

test("does not put bound values in span attributes", async () => {
  capture();
  const db = traceD1(fakeDb());
  await db.prepare("SELECT * FROM users WHERE email = ?").bind("secret@example.com").first();
  expect(JSON.stringify(records[0])).not.toContain("secret@example.com");
});

test("traces exec and batch", async () => {
  capture();
  const db = traceD1(fakeDb());
  await db.exec("CREATE TABLE t (id INTEGER)");
  await db.batch([db.prepare("SELECT 1"), db.prepare("SELECT 2")]);
  expect(records.map((r) => r.attributes["db.operation.name"])).toEqual(["exec", "batch"]);
  expect(records[1]?.attributes["db.batch.size"]).toBe(2);
});

test("records a failing query and rethrows", async () => {
  capture();
  const failing = fakeDb();
  failing.prepare = () =>
    ({
      bind: () => failing.prepare("x"),
      first: async () => {
        throw new Error("no such table");
      },
    }) as never;
  await expect(traceD1(failing).prepare("SELECT 1").first()).rejects.toThrow("no such table");
  expect(records[0]?.error).toBe("no such table");
});

test("traceBindings wraps D1 bindings and leaves others alone", () => {
  const db = fakeDb();
  const env = { DB: db, GREETING: "hi" };
  const traced = traceBindings(env);
  expect(traced.GREETING).toBe("hi");
  expect(traced.DB).not.toBe(db);
  expect(traced.DB).toBe(traced.DB);
  expect(traceBindings(env)).toBe(traced);
});

test("batch passes D1's own statements, not the traced wrappers", async () => {
  capture();
  const native: { sql: string }[] = [];
  const db = traceD1({
    prepare: (sql: string) => {
      const statement = {
        sql,
        bind: () => statement,
        first: async () => null,
        run: async () => ({}),
        all: async () => ({ results: [] }),
        raw: async () => [],
      };
      return statement as never;
    },
    batch: async (statements: unknown[]) => {
      for (const statement of statements as never[]) {
        if (!(statement as { sql?: string }).sql) throw new Error("not a native statement");
        native.push(statement as { sql: string });
      }
      return [];
    },
    exec: async () => ({ count: 0 }),
  } as never);
  await db.batch([db.prepare("SELECT 1").bind(), db.prepare("SELECT 2")] as never);
  expect(native.map((s) => s.sql)).toEqual(["SELECT 1", "SELECT 2"]);
});
