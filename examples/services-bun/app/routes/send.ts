import { Effect } from "effect";
import { route } from "spacefn";

import * as Status from "#modules/status/status.ts";

export default route({
	POST: Effect.as(Status.sendJob("dev"), { queued: true }),
});
