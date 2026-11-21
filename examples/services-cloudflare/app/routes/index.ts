import { Effect } from "effect";
import { route } from "spacefn";

import { layout } from "#lib/ui/layout.ts";
import * as Status from "#modules/status/status.ts";
import { statusView } from "#modules/status/views.ts";

export default route({
	GET: Effect.map(Status.overview, (status) => layout(statusView(status))),
});
