import { SqliteClient } from "@effect/sql-sqlite-node";
import { describe, expect, it } from "@effect/vitest";
import { Context, Effect, Layer } from "effect";
import { Reactivity } from "effect/reactivity";

import { appLayer } from "../src/app-layer.ts";
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

describe("appLayer", () => {
	it.effect("builds env, databases and app/layers.ts over the platform", () =>
		Effect.gen(function* () {
			const services = appLayer(
				{
					env: { file: "app/env.ts", module: { default: AppEnv } },
					layers: { file: "app/layers.ts", module: { default: Layers } },
					db: [db],
				},
				{ platform: Layer.merge(Kv.memory, testEnv({ GREETING: "hi" })), connect: () => sqlite },
			);
			const greeting = yield* Effect.gen(function* () {
				return yield* (yield* Greeter).greet;
			}).pipe(Effect.provide(services));
			expect(greeting).toBe("hi");
		}),
	);

	it.effect("leaves out databases the target doesn't connect", () =>
		Effect.gen(function* () {
			const services = appLayer({ db: [db] }, { platform: Layer.empty, connect: () => undefined });
			const context = yield* Layer.build(services);
			expect(Context.getOption(context, MainDb)._tag).toBe("None");
		}).pipe(Effect.scoped),
	);

	it.effect("names what failed to start", () =>
		Effect.gen(function* () {
			const wrongLayers = appLayer(
				{ layers: { file: "app/layers.ts", module: { default: {} } }, db: [] },
				{ platform: Layer.empty, connect: () => undefined },
			);
			expect((yield* Effect.flip(Layer.build(wrongLayers))).code).toBe("LAYERS_EXPORT");

			const broken = appLayer(
				{ db: [db] },
				{ platform: Layer.empty, connect: () => Effect.die(new Error("no binding DB_MAIN")) },
			);
			const error = yield* Effect.flip(Layer.build(broken));
			expect(error.code).toBe("DB_START");
			expect(error.message).toContain("no binding DB_MAIN");

			const missingEnv = appLayer(
				{ env: { file: "app/env.ts", module: { default: AppEnv } }, db: [] },
				{ platform: testEnv({}), connect: () => undefined },
			);
			expect((yield* Effect.flip(Layer.build(missingEnv))).code).toBe("ENV_INVALID");
		}).pipe(Effect.scoped),
	);
});
