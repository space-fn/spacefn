import { Hono } from "hono";

import api from "#space/api";
import pages from "#space/pages";

const app = new Hono();

app.route("/api", api);
app.route("/", pages);

export default app;
