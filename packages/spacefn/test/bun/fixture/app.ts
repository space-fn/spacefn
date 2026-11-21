// A small app as `space gen` and app/entry.ts would wire it, run by serve.test.ts under Bun.
import { Duration, Effect, Option, Schema, Stream } from "effect";
import {
	app,
	Bus,
	clientAddress,
	cron,
	Input,
	Kv,
	Queue,
	queue,
	route,
	databases,
	staticFiles,
	type SpaceManifest,
} from "spacefn";
import { database } from "spacefn/runtime";

import { platform } from "../../../src/bun/index.ts";

interface NotesQueries {
	addNote: { params: { readonly text: string }; row: never; mode: "exec" };
	listNotes: { params: {}; row: { readonly text: string }; mode: "many" };
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
		listNotes: {
			mode: "many",
			columns: { text: "string" },
			parts: [{ sql: "SELECT text FROM notes ORDER BY id", params: [], gate: null }],
		},
	},
}) {}

const at = (path: `/${string}`) => ({ path, params: [], file: `app/routes${path}.ts` }) as const;

const manifest = {
	name: "fixture",
	routes: [
		{
			...at("/notes"),
			module: {
				default: route({
					GET: Effect.gen(function* () {
						return (yield* NotesDb.listNotes()).map((note) => note.text);
					}),
					POST: Effect.gen(function* () {
						const { text } = yield* Input.body(Schema.Struct({ text: Schema.String }));
						yield* NotesDb.addNote({ text });
						return { added: text };
					}),
				}),
			},
		},
		{
			...at("/whoami"),
			module: {
				default: route({
					GET: Effect.gen(function* () {
						return { pid: process.pid, ip: yield* clientAddress };
					}),
				}),
			},
		},
		{
			...at("/mail"),
			module: {
				default: route({
					POST: Effect.gen(function* () {
						const { to } = yield* Input.body(Schema.Struct({ to: Schema.String }));
						yield* Queue.send("emails", { to });
						return { queued: to };
					}),
					// Who handled the mail to `to`, waiting for the notice when it isn't done yet.
					GET: Effect.scoped(
						Effect.gen(function* () {
							const { to } = yield* Input.query(Schema.Struct({ to: Schema.String }));
							const notices = yield* Bus.subscribe(`mailed:${to}`);
							const done = yield* Kv.get(`mailed:${to}`);
							if (Option.isSome(done)) return { pid: Number(done.value) };
							const notice = yield* Stream.runHead(notices).pipe(
								Effect.timeoutOption(Duration.seconds(10)),
								Effect.map(Option.flatten),
							);
							return { pid: Option.match(notice, { onNone: () => null, onSome: Number }) };
						}),
					),
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
							if (to === "crash") return process.exit(1);
							yield* Kv.set(`mailed:${to}`, String(process.pid));
							yield* Bus.publish(`mailed:${to}`, String(process.pid));
						}),
				}),
			},
		},
	],
	crons: [
		{
			name: "minutely",
			file: "app/crons/minutely.ts",
			module: {
				default: cron(
					"* * * * *",
					Effect.gen(function* () {
						yield* Kv.set("cron", String(process.pid));
					}),
				),
			},
		},
	],
	db: [{ name: "notes", driver: "libsql", binding: "DB_NOTES", module: { default: NotesDb } }],
} as const satisfies SpaceManifest;

// As the scaffolded app/entry.ts has it, without telemetry.
export default app(manifest, {
	services: [platform(manifest), databases(manifest)],
	before: [staticFiles()],
});
