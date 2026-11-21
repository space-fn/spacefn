import { Effect } from "effect";
import { route } from "spacefn";

import { layout } from "#lib/ui/layout.ts";
import * as Status from "#modules/status/status.ts";

export default route({ GET: Effect.map(Status.lastJob, layout) });
