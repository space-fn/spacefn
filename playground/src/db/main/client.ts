// --- Database Client ----------------------------------------------------------
// Lazy singleton Kysely client with SQLite (better-sqlite3)

import { Kysely } from "kysely"
import BetterSqlite3 from "better-sqlite3"
import { SqliteDialect } from "kysely"

import type { Database } from "./types"

let _db: Kysely<Database> | null = null

export function getDb(): Kysely<Database> {
	if (!_db) {
		_db = new Kysely<Database>({
			dialect: new SqliteDialect({
				database: new BetterSqlite3(":memory:"),
			}),
		})
	}
	return _db
}
