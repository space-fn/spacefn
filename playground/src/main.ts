import { createServer } from "@spacefn/server";
import { sql } from "kysely";

import middlewares from "#space/middlewares";
import pages from "#space/pages";
import routes from "#space/routes";

import { getDb } from "./db/main/client";

// --- Bootstrap: create tables for in-memory SQLite --------------------------

const db = getDb();

await sql`CREATE TABLE IF NOT EXISTS "categories" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" VARCHAR(255) NOT NULL UNIQUE,
  "color" VARCHAR(7) NOT NULL DEFAULT '#6b7280',
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
)`.execute(db);

await sql`CREATE TABLE IF NOT EXISTS "todos" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "completed" INTEGER NOT NULL DEFAULT 0,
  "categoryId" INTEGER,
  "priority" VARCHAR(255) NOT NULL DEFAULT 'medium',
  "dueDate" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id"),
  CHECK ("priority" IN ('low', 'medium', 'high'))
)`.execute(db);

// --- Seed demo data ---------------------------------------------------------

const categoryCount = await db
	.selectFrom("categories")
	.select(({ fn }) => fn.count("id").as("count"))
	.executeTakeFirst();
if (categoryCount && Number(categoryCount.count) === 0) {
	await sql`INSERT INTO "categories" ("name", "color") VALUES ('Work', '#3b82f6'), ('Personal', '#22c55e'), ('Urgent', '#ef4444')`.execute(
		db,
	);
}

export default createServer({ routes, pages, middlewares });
