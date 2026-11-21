import { queue } from "spacefn";

import * as Status from "#modules/status/status.ts";

export default queue({ body: Status.Job, handler: Status.runJob });
