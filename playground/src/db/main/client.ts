// --- Database Client ----------------------------------------------------------
// Lazy singleton Kysely client with file-based SQLite

import { Kysely } from "kysely"
import { LibsqlDialect } from "kysely-libsql"

import type { Database } from "./types"

let _db: Kysely<Database> | null = null

export function getDb(): Kysely<Database> {
	if (!_db) {
		_db = new Kysely<Database>({
			dialect: new LibsqlDialect({
				url: "file:playground.db",
			}),
		})
	}
	return _db
}
