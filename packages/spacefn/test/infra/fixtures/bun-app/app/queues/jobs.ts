import { Effect, Schema } from "effect";
import { Kv, queue } from "spacefn";

export default queue({
	body: Schema.Struct({ at: Schema.String }),
	handler: ({ at }) =>
		Effect.gen(function* () {
			yield* Kv.set("job", `done in ${at}`);
		}),
});
