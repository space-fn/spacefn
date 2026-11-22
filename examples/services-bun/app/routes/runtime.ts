import { route } from "spacefn";

import * as Status from "#modules/status/status.ts";

export default route({ GET: Status.runtime });
