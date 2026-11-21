import { app, databases, staticFiles, telemetry } from "spacefn";
import { platform } from "spacefn/platform";

import Env from "#configs/env.ts";
import { manifest } from "#space/manifest.ts";

export default app(manifest, {
	services: [platform(manifest), Env.layer, databases(manifest), telemetry(manifest.name)],
	before: [staticFiles()],
});
