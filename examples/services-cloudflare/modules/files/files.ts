import { Effect, Option } from "effect";
import { Blob } from "spacefn";

/** Stores a file in the bucket and reads it back. */
export const roundTrip = Effect.gen(function* () {
	yield* Blob.put("notes/a.txt", "stored in r2", { contentType: "text/plain" });
	const file = Option.getOrThrow(yield* Blob.get("notes/a.txt"));
	return { text: new TextDecoder().decode(file.body), type: file.contentType };
});
