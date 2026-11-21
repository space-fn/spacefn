import { Effect } from "effect";
import { Queue, route } from "spacefn";

export default route({
	POST: Effect.gen(function* () {
		yield* Queue.send("jobs", { at: "dev" });
		return { queued: true };
	}),
});
