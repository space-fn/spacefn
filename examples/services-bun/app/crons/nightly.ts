import { cron } from "spacefn";

import * as Status from "#modules/status/status.ts";

export default cron("0 3 * * *", Status.nightly);
