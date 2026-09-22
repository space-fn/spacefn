import { createServer } from "@spacefn/server";

import middlewares from "#space/middlewares";
import routes from "#space/routes";

export default createServer({ routes, middlewares });
