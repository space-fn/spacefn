import { Effect, Option } from "effect";
import { Blob, route } from "spacefn";

export default route({
	GET: Effect.gen(function* () {
		const blob = yield* Blob;
		yield* blob.put("notes/a.txt", "stored in r2", { contentType: "text/plain" });
		const file = Option.getOrThrow(yield* blob.get("notes/a.txt"));
		return { text: new TextDecoder().decode(file.body), type: file.contentType };
	}),
});
