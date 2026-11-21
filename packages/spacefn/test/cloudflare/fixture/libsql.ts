// spacefn/libsql in workerd: from a Worker's fetch and from inside a Durable Object, to a
// libSQL server over HTTP. Bundled and run by libsql.test.ts.
import { DurableObject } from "cloudflare:workers";
import { Effect, Option } from "effect";
import { database } from "spacefn/internal/runtime";

import { libsql } from "../../../src/libsql.ts";

interface NotesQueries {
	addNote: { params: { readonly text: string }; row: never; mode: "exec" };
	countNotes: { params: {}; row: { readonly n: number }; mode: "one" };
}

class NotesDb extends database<NotesDb, NotesQueries>()({
	name: "notes",
	migrations: [
		{ id: "0001_notes", sql: "CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);" },
	],
	queries: {
		addNote: {
			mode: "exec",
			columns: {},
			parts: [{ sql: "INSERT INTO notes (text) VALUES (?)", params: ["text"], gate: null }],
		},
		countNotes: {
			mode: "one",
			columns: { n: "number" },
			parts: [{ sql: "SELECT count(*) AS n FROM notes", params: [], gate: null }],
		},
	},
}) {}

interface Env {
	readonly LIBSQL_URL: string;
	readonly ROOM: DurableObjectNamespace;
}

/** Migrates the database (once), adds a note and counts them, through the generated queries. */
const addAndCount = (url: string, text: string) =>
	Effect.gen(function* () {
		yield* NotesDb.addNote({ text });
		return Option.getOrThrow(yield* NotesDb.countNotes()).n;
	}).pipe(Effect.provide(NotesDb.layer(libsql({ url }))));

/** A committed transaction, and one that fails and rolls back: libSQL's interactive transactions over HTTP. */
const transactions = (url: string) =>
	Effect.scoped(
		Effect.gen(function* () {
			const { sql } = yield* libsql({ url });
			yield* sql.withTransaction(sql`INSERT INTO notes (text) VALUES ('committed')`);
			yield* sql
				.withTransaction(
					Effect.andThen(sql`INSERT INTO notes (text) VALUES ('rolled back')`, Effect.fail("no")),
				)
				.pipe(Effect.flip);
			const rows = yield* sql<{
				text: string;
			}>`SELECT text FROM notes WHERE text IN ('committed', 'rolled back')`;
			return rows.map((row) => row.text);
		}),
	);

const json = (effect: Effect.Effect<unknown, unknown>) =>
	Effect.runPromise(effect).then(
		(value) => Response.json(value),
		(error: unknown) => Response.json({ error: String(error) }, { status: 500 }),
	);

export class Room extends DurableObject<Env> {
	override fetch(request: Request) {
		return json(addAndCount(this.env.LIBSQL_URL, new URL(request.url).searchParams.get("text")!));
	}
}

export default {
	fetch(request: Request, env: Env) {
		const url = new URL(request.url);
		if (url.pathname === "/worker")
			return json(addAndCount(env.LIBSQL_URL, url.searchParams.get("text")!));
		if (url.pathname === "/transactions") return json(transactions(env.LIBSQL_URL));
		if (url.pathname === "/durable-object")
			return env.ROOM.get(env.ROOM.idFromName("room")).fetch(request);
		return new Response("not found", { status: 404 });
	},
};
