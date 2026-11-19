import { join } from "node:path";

import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { Blob } from "spacefn";

import { blobLayer } from "../src/blob.ts";
import { dir } from "./helpers.ts";

describe("blob", () => {
	it.live("Blob stores files with their content type", () =>
		Effect.gen(function* () {
			const blob = yield* Blob;
			yield* blob.put("avatars/ada.png", new Uint8Array([1, 2, 3]), { contentType: "image/png" });
			yield* blob.put("notes/../escape", "text");
			const object = Option.getOrThrow(yield* blob.get("avatars/ada.png"));
			expect([...object.body]).toEqual([1, 2, 3]);
			expect(object.contentType).toBe("image/png");
			expect(yield* blob.list({ prefix: "avatars/" })).toEqual(["avatars/ada.png"]);
			expect(yield* blob.list()).toEqual(["avatars/ada.png", "notes/../escape"]);
			yield* blob.delete("avatars/ada.png");
			expect(yield* blob.get("avatars/ada.png")).toEqual(Option.none());
		}).pipe(Effect.provide(blobLayer(join(dir, "blob")))),
	);
});
