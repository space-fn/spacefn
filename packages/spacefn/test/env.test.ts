import { inspect } from "node:util";

import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Redacted, Schema } from "effect";

import { defineEnv, Env } from "../src/env.ts";

const AppEnv = defineEnv({
	GREETING: Env.string({ default: "hello" }),
	MAX_ITEMS: Env.int({ default: 10 }),
	VERBOSE: Env.boolean({ default: false }),
	API_KEY: Env.secret(),
	WEBHOOK_URL: Env.url({ optional: true }),
	REGION: Env.schema(Schema.Literals(["eu", "us"]), { default: "eu" }),
});

const readEnv = Effect.gen(function* () {
	return yield* AppEnv;
});

const withValues = (values: Record<string, unknown>) =>
	Layer.provide(AppEnv.layer, ConfigProvider.layer(ConfigProvider.fromUnknown(values)));

describe("defineEnv", () => {
	it.effect("reads values and applies defaults", () =>
		Effect.gen(function* () {
			const env = yield* AppEnv;
			expect(env.GREETING).toBe("hello");
			expect(env.MAX_ITEMS).toBe(25);
			expect(env.VERBOSE).toBe(true);
			expect(env.WEBHOOK_URL).toBeUndefined();
			expect(env.REGION).toBe("us");
			expect(Redacted.value(env.API_KEY)).toBe("k3y");
		}).pipe(
			Effect.provide(
				withValues({ MAX_ITEMS: "25", VERBOSE: "true", API_KEY: "k3y", REGION: "us" }),
			),
		),
	);

	it.effect("keeps secrets out of logs", () =>
		Effect.gen(function* () {
			const env = yield* AppEnv;
			expect(inspect(env)).not.toContain("k3y");
			expect(JSON.stringify(env)).not.toContain("k3y");
		}).pipe(Effect.provide(withValues({ API_KEY: "k3y" }))),
	);

	it.effect("parses an optional value when present", () =>
		Effect.gen(function* () {
			const env = yield* AppEnv;
			expect(env.WEBHOOK_URL?.hostname).toBe("example.com");
		}).pipe(Effect.provide(withValues({ API_KEY: "k", WEBHOOK_URL: "https://example.com/hook" }))),
	);

	it.effect("fails with a SpaceError naming the missing variable", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(readEnv.pipe(Effect.provide(withValues({}))));
			expect(error).toMatchObject({ _tag: "SpaceError", code: "ENV_INVALID", file: "app/env.ts" });
			expect(error.message).toContain("API_KEY");
		}),
	);

	it.effect("fails on a value that does not parse", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				readEnv.pipe(Effect.provide(withValues({ API_KEY: "k", MAX_ITEMS: "lots" }))),
			);
			expect(error.message).toContain("MAX_ITEMS");
		}),
	);
});
