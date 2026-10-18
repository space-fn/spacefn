import { beforeAll, expect, test } from "vite-plus/test";

import type { Migration } from "../src/db";
import { inferQuery, scratchDatabase } from "../src/db/infer";
import { parseQueryFile } from "../src/db/query-file";

const migrations: Migration[] = [
  {
    id: "0001_init",
    sql: `CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, bio TEXT, avatar BLOB);
		CREATE TABLE todos (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, score REAL);`,
  },
];

let scratch: Awaited<ReturnType<typeof scratchDatabase>>;
beforeAll(async () => {
  scratch = await scratchDatabase(migrations);
});

async function infer(text: string) {
  return inferQuery(scratch, parseQueryFile("q.sql", text));
}

test("parses the name header and the mode", async () => {
  const query = parseQueryFile("q.sql", "-- name: findUser :one\nSELECT 1");
  expect(query).toMatchObject({ name: "findUser", mode: "one", sql: "SELECT 1" });
});

test("rejects a file without a name header", async () => {
  expect(() => parseQueryFile("q.sql", "SELECT 1")).toThrow('must start with "-- name:');
});

test("takes types and nullability from the schema for column references", async () => {
  const result = await infer(
    "-- name: todo :one\nSELECT todos.id AS id, title, bio, score FROM todos JOIN users ON users.id = todos.user_id",
  );
  expect(result.columns).toEqual([
    { name: "id", type: "number", nullable: false, source: "schema" },
    { name: "title", type: "string", nullable: false, source: "schema" },
    { name: "bio", type: "string", nullable: true, source: "schema" },
    { name: "score", type: "number", nullable: true, source: "schema" },
  ]);
});

test("maps BLOB columns to bytes", async () => {
  const result = await infer("-- name: avatarOf :one\nSELECT avatar FROM users");
  expect(result.columns[0]).toMatchObject({ name: "avatar", type: "bytes", nullable: true });
});

test("columns on the nullable side of a LEFT JOIN are nullable even when NOT NULL", async () => {
  const result = await infer(
    "-- name: todosWithOwner :many\nSELECT todos.title AS title, users.email AS owner FROM todos LEFT JOIN users ON users.id = todos.user_id",
  );
  expect(result.columns).toEqual([
    { name: "title", type: "string", nullable: false, source: "schema" },
    { name: "owner", type: "string", nullable: true, source: "schema" },
  ]);
});

test("expressions need an annotation", async () => {
  await expect(
    async () => await infer("-- name: count :one\nSELECT count(*) AS n FROM todos"),
  ).rejects.toThrow('column "n" is an expression');
});

test("an annotation supplies the type of an expression", async () => {
  const result = await infer(
    "-- name: count :one\n-- @column n number\nSELECT count(*) AS n FROM todos",
  );
  expect(result.columns).toEqual([
    { name: "n", type: "number", nullable: false, source: "annotation" },
  ]);
});

test("an annotation can mark a column nullable", async () => {
  const result = await infer(
    "-- name: shout :one\n-- @column shout string?\nSELECT upper(title) AS shout FROM todos",
  );
  expect(result.columns[0]).toMatchObject({ name: "shout", type: "string", nullable: true });
});

test("annotations can overrule the schema, e.g. to type a flag as boolean", async () => {
  const result = await infer(
    "-- name: flags :many\n-- @column done boolean\nSELECT done FROM todos",
  );
  expect(result.columns[0]).toMatchObject({ type: "boolean", source: "annotation" });
});

test("rejects an unknown annotation type", async () => {
  await expect(
    async () => await infer("-- name: x :one\n-- @column id date\nSELECT id FROM todos"),
  ).rejects.toThrow('unknown type "date"');
});

test("rejects duplicate result names", async () => {
  await expect(
    async () =>
      await infer(
        "-- name: dup :many\nSELECT t.id, u.id FROM todos t JOIN users u ON u.id = t.user_id",
      ),
  ).rejects.toThrow('returns "id" twice');
});

test("a query that does not match the schema fails with the database's message", async () => {
  await expect(
    async () => await infer("-- name: bad :many\nSELECT nope FROM todos"),
  ).rejects.toThrow(/no such column/);
});

test("a RIGHT JOIN makes every column nullable", async () => {
  const result = await infer(
    "-- name: r :many\nSELECT todos.title AS title, users.email AS owner FROM todos RIGHT JOIN users ON users.id = todos.user_id",
  );
  expect(result.columns.every((c) => c.nullable)).toBe(true);
});
