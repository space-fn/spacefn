import { createServer } from "@spacefn/server";

import middlewares from "#space/middlewares";
import pages from "#space/pages";
import routes from "#space/routes";

export default createServer({ routes, pages, middlewares });
