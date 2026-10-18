import { createApp, registerRoutes, registerPages, mountApp } from "@space/worker";

import schema from "./env";

const app = createApp({ env: schema });

app.onError((err, c) => c.json({ error: "internal_error", message: "Something went wrong" }, 500));

registerRoutes(app);
registerPages(app);

export * from "@space/exports";
export default mountApp(app);
