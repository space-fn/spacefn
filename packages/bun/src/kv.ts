import { Clock, Duration, Effect, Layer, Option } from "effect";
import { Kv, KvError } from "spacefn";

import { SpaceState, throttled } from "./state.ts";

/** Kv on the state database. Expired keys read as missing and are swept once a minute. */
export const kvLayer: Layer.Layer<Kv, never, SpaceState> = Layer.effect(
	Kv,
	Effect.gen(function* () {
		const sql = yield* SpaceState;
		const sweep = throttled(60_000);
		const fail = (operation: "get" | "set" | "delete", key: string) => (cause: unknown) =>
			new KvError({ operation, key, cause });
		return {
			get: (key) =>
				Effect.gen(function* () {
					const now = yield* Clock.currentTimeMillis;
					const rows = yield* sql<{ value: string }>`
						SELECT value FROM space_kv
						WHERE key = ${key} AND (expires_at IS NULL OR expires_at > ${now})`;
					return Option.fromNullishOr(rows[0]?.value);
				}).pipe(Effect.mapError(fail("get", key))),
			set: (key, value, options) =>
				Effect.gen(function* () {
					const now = yield* Clock.currentTimeMillis;
					const expiresAt =
						options?.ttl === undefined
							? null
							: now + Duration.toMillis(Duration.fromInputUnsafe(options.ttl));
					yield* sql`
						INSERT INTO space_kv (key, value, expires_at) VALUES (${key}, ${value}, ${expiresAt})
						ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`;
					yield* sweep(
						now,
						sql`DELETE FROM space_kv WHERE expires_at <= ${now}`.pipe(Effect.asVoid),
					);
				}).pipe(Effect.mapError(fail("set", key))),
			delete: (key) =>
				sql`DELETE FROM space_kv WHERE key = ${key}`.pipe(
					Effect.asVoid,
					Effect.mapError(fail("delete", key)),
				),
		};
	}),
);
