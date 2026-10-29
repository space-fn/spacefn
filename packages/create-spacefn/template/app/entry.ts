// @ts-nocheck
import { createApp, registerRoutes, mountApp } from "@space/worker";
import { onError } from "spacefn/handler";

import schema from "./env";

const app = createApp({ env: schema });

app.onError(onError);

registerRoutes(app);

export * from "@space/exports";
export default mountApp(app);
