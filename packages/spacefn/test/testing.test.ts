import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { HttpServerResponse } from "effect/http";

import { database } from "../src/db/database.ts";
import { middleware } from "../src/http/middleware.ts";
import { route } from "../src/http/route.ts";
import { defineEnv, Env, Kv, Queue } from "../src/index.ts";
import { memoryServices, QueueInbox, testDb, testEnv, testHttp } from "../src/testing.ts";

const AppEnv = defineEnv({ FROM: Env.string() });

// What an app's module test looks like: business logic over services, no runtime.
const sendWelcome = (to: string) =>
	Effect.gen(function* () {
		const env = yield* AppEnv;
		const kv = yield* Kv;
		if (Option.isSome(yield* kv.get(`welcomed:${to}`))) return false;
		yield* (yield* Queue).send("emails", { from: env.FROM, to });
		yield* kv.set(`welcomed:${to}`, "1");
		return true;
	});

const TestLayer = Layer.mergeAll(
	memoryServices,
	AppEnv.layer.pipe(Layer.provide(testEnv({ FROM: "hi@app.dev" }))),
);

describe("spacefn/testing", () => {
	it.effect("runs module logic against in-memory services and test env", () =>
		Effect.gen(function* () {
			expect(yield* sendWelcome("a@example.com")).toBe(true);
			expect(yield* sendWelcome("a@example.com")).toBe(false);
			expect(yield* (yield* QueueInbox).take("emails")).toEqual([
				{ from: "hi@app.dev", to: "a@example.com" },
			]);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("gives each test fresh services", () =>
		Effect.gen(function* () {
			expect(yield* sendWelcome("a@example.com")).toBe(true);
		}).pipe(Effect.provide(TestLayer)),
	);
});

describe("testHttp", () => {
	it("serves routes and middleware with one shared set of services", async () => {
		const counter = route({
			POST: Effect.gen(function* () {
				const kv = yield* Kv;
				const n = Number(Option.getOrElse(yield* kv.get("n"), () => "0")) + 1;
				yield* kv.set("n", String(n));
				return { n };
			}),
		});
		const stamp = middleware((next) =>
			Effect.gen(function* () {
				const kv = yield* Kv;
				const response = yield* next;
				const n = Option.getOrElse(yield* kv.get("n"), () => "0");
				return HttpServerResponse.setHeader(response, "x-n", n);
			}),
		);
		const app = testHttp(
			{
				routes: [
					{
						path: "/count",
						params: [],
						file: "app/routes/count.ts",
						module: { default: counter },
					},
				],
				middleware: [
					{ folder: "app/routes", file: "app/routes/_middleware.ts", module: { default: stamp } },
				],
			},
			memoryServices,
		);
		await app.fetch("/count", { method: "POST" });
		const second = await app.fetch("/count", { method: "POST" });
		expect(await second.json()).toEqual({ n: 2 });
		expect(second.headers.get("x-n")).toBe("2");
		await app.dispose();
	});
});

class NotesDb extends database<
	NotesDb,
	{
		addNote: { params: { readonly body: string }; row: never; mode: "exec" };
		countNotes: { params: Record<string, never>; row: { readonly n: number }; mode: "one" };
	}
>()({
	name: "notes",
	migrations: [{ id: "0001_notes", sql: "CREATE TABLE notes (body TEXT NOT NULL);" }],
	queries: {
		addNote: {
			mode: "exec",
			columns: {},
			parts: [{ sql: "INSERT INTO notes (body) VALUES (?)", params: ["body"], gate: null }],
		},
		countNotes: {
			mode: "one",
			columns: { n: "number" },
			parts: [{ sql: "SELECT count(*) AS n FROM notes", params: [], gate: null }],
		},
	},
}) {}

const countNotes = Effect.gen(function* () {
	const db = yield* NotesDb;
	return Option.map(yield* db.countNotes(), (row) => row.n);
});

describe("testDb", () => {
	it.effect("gives a migrated database", () =>
		Effect.gen(function* () {
			const db = yield* NotesDb;
			yield* db.addNote({ body: "hi" });
			expect(yield* countNotes).toEqual(Option.some(1));
		}).pipe(Effect.provide(testDb(NotesDb))),
	);

	it.effect("starts empty on every build", () =>
		Effect.gen(function* () {
			expect(yield* countNotes).toEqual(Option.some(0));
		}).pipe(Effect.provide(testDb(NotesDb))),
	);

	it("serves routes that use the database", async () => {
		const notes = route({
			POST: Effect.gen(function* () {
				const db = yield* NotesDb;
				yield* db.addNote({ body: "from a route" });
				return yield* countNotes;
			}).pipe(Effect.map(Option.getOrElse(() => 0))),
		});
		const app = testHttp(
			{
				routes: [
					{
						path: "/notes",
						params: [],
						file: "app/routes/notes.ts",
						module: { default: notes },
					},
				],
			},
			testDb(NotesDb),
		);
		const response = await app.fetch("/notes", { method: "POST" });
		expect(await response.json()).toBe(1);
		await app.dispose();
	});
});
