import { SqliteClient } from "@effect/sql-sqlite-node";
import { describe, expect, it } from "@effect/vitest";
import { Context, Effect, Layer } from "effect";
import { Reactivity } from "effect/reactivity";

import { databases, DbConnector } from "../src/app-layer.ts";
import { app, appServices } from "../src/app.ts";
import { transactional } from "../src/db/connection.ts";
import { database } from "../src/db/database.ts";
import { defineEnv, Env } from "../src/env.ts";
import { Kv } from "../src/services/kv.ts";
import { testEnv } from "../src/testing.ts";

class MainDb extends database<MainDb, {}>()({
	name: "main",
	migrations: [{ id: "0001_init", sql: "CREATE TABLE notes (id INTEGER PRIMARY KEY)" }],
	queries: {},
}) {}

const AppEnv = defineEnv({ GREETING: Env.string() });

class Greeter extends Context.Service<
	Greeter,
	{ readonly greet: Effect.Effect<string, unknown> }
>()("test/Greeter") {}

// The app's own layer, using the env, a database and a platform service.
const Layers = Layer.effect(
	Greeter,
	Effect.gen(function* () {
		const env = yield* AppEnv;
		const kv = yield* Kv;
		yield* MainDb;
		return { greet: Effect.as(kv.set("seen", "1"), env.GREETING) };
	}),
);

const sqlite = Effect.gen(function* () {
	const sql = yield* SqliteClient.make({ filename: ":memory:" }).pipe(
		Effect.provide(Reactivity.layer),
	);
	return transactional(sql);
});

const db = {
	name: "main",
	driver: "libsql",
	binding: "DB_MAIN",
	module: { default: MainDb },
} as const;

const manifest = { name: "app", routes: [], middleware: [], queues: [], crons: [] };

/** The services as app/entry.ts lists them, over a platform that connects with `connect`. */
const servicesOf = (
	connect: (typeof DbConnector)["Service"],
	services: (platform: Layer.Layer<any>) => Layer.Any[],
) =>
	appServices(
		app(
			{ ...manifest, db: [db] },
			{ services: services(Layer.merge(Kv.memory, Layer.succeed(DbConnector, connect))) },
		),
	) as Layer.Layer<any, any>;

describe("the entry's services", () => {
	it.effect("builds the env, the databases and the app's own layer over the platform", () =>
		Effect.gen(function* () {
			const services = servicesOf(
				() => sqlite,
				(platform) => [
					Layer.merge(platform, testEnv({ GREETING: "hi" })),
					AppEnv.layer,
					databases({ db: [db] }),
					Layers,
				],
			);
			const greeting = yield* Effect.gen(function* () {
				return yield* (yield* Greeter).greet;
			}).pipe(Effect.provide(services));
			expect(greeting).toBe("hi");
		}),
	);

	it.effect("leaves out databases the target doesn't connect", () =>
		Effect.gen(function* () {
			const services = servicesOf(
				() => undefined,
				(platform) => [platform, databases({ db: [db] })],
			);
			const context = yield* Layer.build(services);
			expect(Context.getOption(context, MainDb)._tag).toBe("None");
		}).pipe(Effect.scoped),
	);

	it.effect("names what failed to start", () =>
		Effect.gen(function* () {
			const broken = servicesOf(
				() => Effect.die(new Error("no binding DB_MAIN")),
				(platform) => [platform, databases({ db: [db] })],
			);
			const error = yield* Effect.flip(Layer.build(broken));
			expect(error.code).toBe("DB_START");
			expect(error.message).toContain("no binding DB_MAIN");

			const stale = databases({ db: [{ ...db, module: { default: {} } }] }).pipe(
				Layer.provide(Layer.succeed(DbConnector, () => undefined)),
			);
			expect((yield* Effect.flip(Layer.build(stale))).code).toBe("DB_EXPORT");

			const missingEnv = servicesOf(
				() => undefined,
				(platform) => [Layer.merge(platform, testEnv({})), AppEnv.layer],
			);
			expect((yield* Effect.flip(Layer.build(missingEnv))).code).toBe("ENV_INVALID");
		}).pipe(Effect.scoped),
	);
});
