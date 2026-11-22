import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";

import { Blob } from "../src/services/blob.ts";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("Blob.memory", () => {
	it.effect("stores bytes or text with their content type and size", () =>
		Effect.gen(function* () {
			const blob = yield* Blob;
			yield* blob.put("avatars/1.txt", "hello", { contentType: "text/plain" });
			const object = Option.getOrThrow(yield* blob.get("avatars/1.txt"));
			expect(text(object.body)).toBe("hello");
			expect(object).toMatchObject({ key: "avatars/1.txt", size: 5, contentType: "text/plain" });
			expect(object.uploadedAt).toBeInstanceOf(Date);
		}).pipe(Effect.provide(Blob.memory)),
	);

	it.effect("keeps its own copy of the bytes", () =>
		Effect.gen(function* () {
			const blob = yield* Blob;
			const bytes = new Uint8Array([1, 2, 3]);
			yield* blob.put("b", bytes);
			bytes[0] = 9;
			expect([...Option.getOrThrow(yield* blob.get("b")).body]).toEqual([1, 2, 3]);
		}).pipe(Effect.provide(Blob.memory)),
	);

	it.effect("lists keys by prefix in order, with a limit", () =>
		Effect.gen(function* () {
			const blob = yield* Blob;
			for (const key of ["u/2", "u/1", "x/1", "u/3"]) yield* blob.put(key, key);
			expect(yield* blob.list({ prefix: "u/" })).toEqual(["u/1", "u/2", "u/3"]);
			expect(yield* blob.list({ prefix: "u/", limit: 2 })).toEqual(["u/1", "u/2"]);
			expect(yield* blob.list()).toHaveLength(4);
		}).pipe(Effect.provide(Blob.memory)),
	);

	it.effect("deletes, and a missing key is none", () =>
		Effect.gen(function* () {
			const blob = yield* Blob;
			yield* blob.put("a", "1");
			yield* blob.delete("a");
			yield* blob.delete("never-existed");
			expect(yield* blob.get("a")).toEqual(Option.none());
		}).pipe(Effect.provide(Blob.memory)),
	);
});
