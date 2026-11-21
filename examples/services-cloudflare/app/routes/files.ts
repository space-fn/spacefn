import { route } from "spacefn";

import * as Files from "#modules/files/files.ts";

export default route({ GET: Files.roundTrip });
