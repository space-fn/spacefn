import { Effect, Option, Redacted, Schema } from "effect";
import { Kv, Queue } from "spacefn";

import Env from "#configs/env.ts";
import MainDb from "#space/db/main.ts";

/** What the `jobs` queue carries: where the job was sent from. */
export const Job = Schema.Struct({ at: Schema.String });

/** A note added on each visit, then what every binding holds. */
export const overview = Effect.gen(function* () {
	const env = yield* Env;
	yield* MainDb.addNote({ text: "hi" });
	return {
		greeting: env.GREETING,
		notes: Option.getOrThrow(yield* MainDb.countNotes()).n,
		job: Option.getOrElse(yield* Kv.get("job"), () => "none"),
		secretLength: Redacted.value(env.API_KEY).length,
	};
});

export const sendJob = (at: string) => Queue.send("jobs", { at });

/** The queue consumer: records that the job ran. */
export const runJob = ({ at }: typeof Job.Type) => Kv.set("job", `done in ${at}`);

export const nightly = Effect.log("nightly run");
