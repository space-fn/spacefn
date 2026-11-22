import { app, databases, staticFiles, telemetry } from "spacefn";
import { platform } from "spacefn/platform";

import { manifest } from "#space/manifest.ts";

export default app(manifest, {
	services: [platform(manifest), databases(manifest), telemetry(manifest.name)],
	before: [staticFiles()],
});
