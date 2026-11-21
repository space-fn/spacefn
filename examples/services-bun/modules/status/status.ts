import { Effect, Option, Schema } from "effect";
import { Kv, Queue } from "spacefn";

/** What the `jobs` queue carries: where the job was sent from. */
export const Job = Schema.Struct({ at: Schema.String });

/** What the last job left in KV, or `none`. */
export const lastJob = Effect.map(
	Kv.get("job"),
	Option.getOrElse(() => "none"),
);

export const sendJob = (at: string) => Queue.send("jobs", { at });

/** The queue consumer: records that the job ran. */
export const runJob = ({ at }: typeof Job.Type) => Kv.set("job", `done in ${at}`);

/** Which runtime serves the app: `bun`, or `node` under Vite in dev. */
export const runtime = Effect.sync(() => ("Bun" in globalThis ? "bun" : "node"));

export const nightly = Effect.log("nightly run");
