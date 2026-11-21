import { SqliteClient } from "@effect/sql-sqlite-node";
import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { Reactivity } from "effect/reactivity";
import { SqlClient } from "effect/sql";

import { transactional } from "../src/db/connection.ts";
import { buildQuery, database } from "../src/db/database.ts";

// Shaped like a generated `.space/db/main.ts`.
const migrations = [
	{
		id: "0001_todos",
		sql: "CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT NOT NULL, note TEXT, done INTEGER NOT NULL DEFAULT 0, icon BLOB);",
	},
] as const;

const queries = {
	listTodos: {
		mode: "many",
		columns: { id: "number", title: "string", note: "string?", done: "boolean" },
		parts: [
			{ sql: "SELECT id, title, note, done FROM todos WHERE 1 = 1", params: [], gate: null },
			{ sql: "AND done = ?", params: ["done"], gate: ["done"] },
			{ sql: "ORDER BY id", params: [], gate: null },
		],
	},
	findTodo: {
		mode: "one",
		columns: { title: "string", icon: "bytes?" },
		parts: [{ sql: "SELECT title, icon FROM todos WHERE id = ?", params: ["id"], gate: null }],
	},
	addTodo: {
		mode: "exec",
		columns: {},
		parts: [
			{
				sql: "INSERT INTO todos (title, note, done, icon) VALUES (?, ?, ?, ?)",
				params: ["title", "note", "done", "icon"],
				gate: null,
			},
		],
	},
	badRow: {
		mode: "many",
		columns: { title: "number" },
		parts: [{ sql: "SELECT title FROM todos", params: [], gate: null }],
	},
	// queries/todos/mark-done.sql and queries/todos/stats/count-done.sql
	"todos.markDone": {
		mode: "exec",
		columns: {},
		parts: [{ sql: "UPDATE todos SET done = 1 WHERE id = ?", params: ["id"], gate: null }],
	},
	"todos.stats.countDone": {
		mode: "one",
		columns: { n: "number" },
		parts: [{ sql: "SELECT count(*) AS n FROM todos WHERE done = 1", params: [], gate: null }],
	},
} as const;

interface Row {
	readonly id: number;
	readonly title: string;
	readonly note: string | null;
	readonly done: boolean;
}
interface Queries {
	listTodos: { params: { readonly done?: boolean }; row: Row; mode: "many" };
	findTodo: {
		params: { readonly id: number };
		row: { readonly title: string; readonly icon: Uint8Array | null };
		mode: "one";
	};
	addTodo: {
		params: {
			readonly title: string;
			readonly note: string | null;
			readonly done: boolean;
			readonly icon: Uint8Array | null;
		};
		row: never;
		mode: "exec";
	};
	badRow: { params: Record<string, never>; row: { readonly title: number }; mode: "many" };
	"todos.markDone": { params: { readonly id: number }; row: never; mode: "exec" };
	"todos.stats.countDone": {
		params: Record<string, never>;
		row: { readonly n: number };
		mode: "one";
	};
}

class MainDb extends database<MainDb, Queries>()({ name: "main", migrations, queries }) {}

const Sqlite = SqliteClient.layer({ filename: ":memory:" }).pipe(Layer.provide(Reactivity.layer));
const connect = Effect.gen(function* () {
	return transactional(yield* SqlClient.SqlClient);
});
const Main = MainDb.layer(connect).pipe(Layer.provide(Sqlite));

describe("database", () => {
	it.effect("migrates on build and runs typed queries", () =>
		Effect.gen(function* () {
			const db = yield* MainDb;
			yield* db.addTodo({ title: "Write", note: null, done: true, icon: null });
			yield* db.addTodo({ title: "Ship", note: "soon", done: false, icon: new Uint8Array([1, 2]) });

			expect(yield* db.listTodos()).toEqual([
				{ id: 1, title: "Write", note: null, done: true },
				{ id: 2, title: "Ship", note: "soon", done: false },
			]);
			expect(yield* db.listTodos({ done: false })).toEqual([
				{ id: 2, title: "Ship", note: "soon", done: false },
			]);
			expect(yield* db.findTodo({ id: 2 })).toEqual(
				Option.some({ title: "Ship", icon: new Uint8Array([1, 2]) }),
			);
			expect(yield* db.findTodo({ id: 9 })).toEqual(Option.none());
		}).pipe(Effect.provide(Main)),
	);

	it.effect("nests the queries of a folder under its name", () =>
		Effect.gen(function* () {
			const db = yield* MainDb;
			yield* db.addTodo({ title: "Write", note: null, done: false, icon: null });
			yield* db.todos.markDone({ id: 1 });
			expect(yield* db.todos.stats.countDone()).toEqual(Option.some({ n: 1 }));
			// @ts-expect-error the dotted name is only in the generated data
			expect(db["todos.markDone"]).toBeUndefined();
			const typesOnly = () => {
				// @ts-expect-error a folder is not a query
				db.todos();
				// @ts-expect-error markDone needs its id
				db.todos.markDone();
			};
			expect(typesOnly).toBeTypeOf("function");
		}).pipe(Effect.provide(Main)),
	);

	it.effect("dies when rows don't match the generated types", () =>
		Effect.gen(function* () {
			const db = yield* MainDb;
			yield* db.addTodo({ title: "Write", note: null, done: false, icon: null });
			const exit = yield* Effect.exit(db.badRow());
			expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
			expect(String(Exit.isFailure(exit) && Cause.squash(exit.cause))).toContain(
				"Query main.badRow returned rows that don't match its generated types",
			);
		}).pipe(Effect.provide(Main)),
	);

	it.effect("skips migrations with migrate: false", () =>
		Effect.gen(function* () {
			const db = yield* MainDb;
			const error = yield* Effect.flip(db.listTodos());
			expect(error._tag).toBe("SqlError");
		}).pipe(Effect.provide(MainDb.layer(connect, { migrate: false }).pipe(Layer.provide(Sqlite)))),
	);

	it("types each query's params and result", () => {
		const check = Effect.gen(function* () {
			const db = yield* MainDb;
			// @ts-expect-error id is required
			yield* db.findTodo();
			// @ts-expect-error title must be a string
			yield* db.addTodo({ title: 1, note: null, done: false, icon: null });
			const rows: ReadonlyArray<Row> = yield* db.listTodos();
			const one: Option.Option<{ readonly title: string }> = yield* db.findTodo({ id: 1 });
			return [rows, one];
		});
		expect(check).toBeDefined();
	});
});

describe("buildQuery", () => {
	it("leaves out gated parts whose parameters are missing and encodes booleans", () => {
		expect(buildQuery(queries.listTodos, {})).toEqual({
			sql: "SELECT id, title, note, done FROM todos WHERE 1 = 1\nORDER BY id",
			values: [],
		});
		expect(buildQuery(queries.listTodos, { done: true })).toEqual({
			sql: "SELECT id, title, note, done FROM todos WHERE 1 = 1\nAND done = ?\nORDER BY id",
			values: [1],
		});
	});
});
