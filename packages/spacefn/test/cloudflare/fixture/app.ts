// A small app as `space gen` and app/entry.ts would wire it, bundled and run in workerd by miniflare.test.ts.
import { Effect, ManagedRuntime, Option, Schema, Stream } from "effect";
import {
	app,
	Blob,
	Bus,
	cron,
	Input,
	Kv,
	Queue,
	queue,
	rateLimit,
	route,
	databases,
	type SpaceManifest,
} from "spacefn";
import { database } from "spacefn/runtime";

import {
	CloudflareEnv,
	durableObjectSql,
	platform,
	worker,
} from "../../../src/cloudflare/index.ts";

interface NotesQueries {
	addNote: { params: { readonly text: string }; row: never; mode: "exec" };
	listNotes: { params: {}; row: { readonly text: string }; mode: "many" };
}

class NotesDb extends database<NotesDb, NotesQueries>()({
	name: "notes",
	migrations: [
		{ id: "0001_notes", sql: "CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);" },
		{ id: "0002_index", sql: "CREATE INDEX notes_text ON notes (text);" },
	],
	queries: {
		addNote: {
			mode: "exec",
			columns: {},
			parts: [{ sql: "INSERT INTO notes (text) VALUES (?)", params: ["text"], gate: null }],
		},
		listNotes: {
			mode: "many",
			columns: { text: "string" },
			parts: [{ sql: "SELECT text FROM notes ORDER BY id", params: [], gate: null }],
		},
	},
}) {}

interface CounterQueries {
	bump: { params: {}; row: never; mode: "exec" };
	total: { params: {}; row: { readonly n: number }; mode: "one" };
}

class CounterDb extends database<CounterDb, CounterQueries>()({
	name: "counter",
	migrations: [{ id: "0001_hits", sql: "CREATE TABLE hits (id INTEGER PRIMARY KEY);" }],
	queries: {
		bump: {
			mode: "exec",
			columns: {},
			parts: [{ sql: "INSERT INTO hits DEFAULT VALUES", params: [], gate: null }],
		},
		total: {
			mode: "one",
			columns: { n: "number" },
			parts: [{ sql: "SELECT count(*) AS n FROM hits", params: [], gate: null }],
		},
	},
}) {}

/** An app Durable Object with its own SQLite database. */
export class Counter {
	readonly #runtime: ManagedRuntime.ManagedRuntime<CounterDb, unknown>;
	constructor(ctx: DurableObjectState) {
		this.#runtime = ManagedRuntime.make(CounterDb.layer(durableObjectSql(ctx.storage)));
	}
	fetch(): Promise<Response> {
		return this.#runtime.runPromise(
			Effect.gen(function* () {
				const db = yield* CounterDb;
				yield* db.bump();
				const total = yield* db.total();
				return Response.json(Option.getOrThrow(total).n);
			}),
		);
	}
}

export { SpaceBus, SpaceRateLimiter } from "../../../src/cloudflare/index.ts";

const at = (path: `/${string}`) => ({ path, params: [], file: `app/routes${path}.ts` }) as const;

const manifest = {
	name: "fixture",
	routes: [
		{
			...at("/notes"),
			module: {
				default: route({
					GET: Effect.gen(function* () {
						return (yield* (yield* NotesDb).listNotes()).map((note) => note.text);
					}),
					POST: Effect.gen(function* () {
						const { text } = yield* Input.body(Schema.Struct({ text: Schema.String }));
						yield* (yield* NotesDb).addNote({ text });
						return { added: text };
					}),
				}),
			},
		},
		{
			...at("/storage"),
			module: {
				default: route({
					GET: Effect.gen(function* () {
						const kv = yield* Kv;
						yield* kv.set("greeting", "hi", { ttl: "5 seconds" });
						const blob = yield* Blob;
						yield* blob.put("files/a.txt", "hello", { contentType: "text/plain" });
						const file = Option.getOrThrow(yield* blob.get("files/a.txt"));
						return {
							kv: Option.getOrNull(yield* kv.get("greeting")),
							blob: new TextDecoder().decode(file.body),
							contentType: file.contentType,
							keys: yield* blob.list({ prefix: "files/" }),
						};
					}),
				}),
			},
		},
		{
			...at("/limited"),
			module: {
				default: route({
					GET: Effect.as(rateLimit("test", { limit: 2, window: "1 minute" }), "ok"),
				}),
			},
		},
		{
			...at("/bus"),
			module: {
				default: route({
					GET: Effect.scoped(
						Effect.gen(function* () {
							const bus = yield* Bus;
							const messages = yield* bus.subscribe("news");
							yield* bus.publish("news", "first");
							yield* bus.publish("news", "second");
							return yield* Stream.runCollect(Stream.take(messages, 2));
						}),
					),
				}),
			},
		},
		{
			...at("/counter"),
			module: {
				default: route({
					GET: Effect.gen(function* () {
						const { COUNTER } = (yield* CloudflareEnv) as { COUNTER: DurableObjectNamespace };
						const stub = COUNTER.get(COUNTER.idFromName("one"));
						return yield* Effect.promise(async () => (await stub.fetch("https://counter/")).json());
					}),
				}),
			},
		},
		{
			...at("/email"),
			module: {
				default: route({
					POST: Effect.gen(function* () {
						yield* (yield* Queue).send("emails", { to: "ada" });
						return { queued: true };
					}),
					GET: Effect.gen(function* () {
						return Option.getOrNull(yield* (yield* Kv).get("mailed"));
					}),
				}),
			},
		},
	],
	middleware: [],
	queues: [
		{
			name: "emails",
			binding: "QUEUE_EMAILS",
			file: "app/queues/emails.ts",
			module: {
				default: queue({
					body: Schema.Struct({ to: Schema.String }),
					handler: ({ to }) =>
						Effect.gen(function* () {
							yield* (yield* Kv).set("mailed", to);
						}),
				}),
			},
		},
	],
	crons: [
		{
			name: "nightly",
			file: "app/crons/nightly.ts",
			module: {
				default: cron(
					"0 3 * * *",
					Effect.gen(function* () {
						yield* (yield* Kv).set("cron", "ran");
					}),
				),
			},
		},
	],
	db: [{ name: "notes", driver: "d1", binding: "DB_NOTES", module: { default: NotesDb } }],
} as const satisfies SpaceManifest;

export default worker(app(manifest, { services: [platform(manifest), databases(manifest)] }));
