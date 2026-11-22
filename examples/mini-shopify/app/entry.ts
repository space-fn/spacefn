import { app, databases, errorPage, staticFiles, telemetry } from "spacefn";
import { platform } from "spacefn/platform";

import Env from "#configs/env.ts";
import { hostLayer } from "#modules/shops/host.ts";
import { ShopDatabases } from "#modules/shops/shops.ts";
import { manifest } from "#space/manifest.ts";

export default app(manifest, {
	// In order: each can use the ones before it.
	services: [
		platform(manifest),
		Env.layer,
		// app/db/platform. app/db/shop is "open": "manual": the schema of every shop's own
		// database, which Shops opens per request.
		databases(manifest),
		// Where the shops' databases live: Turso with TURSO_API_TOKEN, else local files.
		hostLayer,
		// Each shop's ShopDb, by slug, for app/routes/s/[shop]/_middleware.ts.
		ShopDatabases.layer,
		telemetry(manifest.name),
	],
	before: [staticFiles()],
	onError: errorPage,
});
