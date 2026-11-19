import { Effect } from "effect";
import { cron } from "spacefn";

export default cron("0 3 * * *", Effect.void);
