import { app, databases, errorPage, staticFiles, telemetry } from "spacefn";
import { platform } from "spacefn/platform";

import Env from "#configs/env.ts";
import { manifest } from "#space/manifest.ts";

// The app: the file conventions (manifest) and what runs with them. It's yours to change;
// spacefn only provides the pieces. The same file runs on Cloudflare and on Bun.
export default app(manifest, {
	// In order: each can use the ones before it, and routes, pages, queues and crons use them all.
	services: [
		// This target's Kv, Blob, Queue, Bus, RateLimiter, HttpClient and database connections.
		platform(manifest),
		// configs/env.ts, read from the environment.
		Env.layer,
		// app/db/*, migrated as each config.json says.
		databases(manifest),
		// Traces, logs and metrics over OTLP, once OTEL_EXPORTER_OTLP_ENDPOINT is set.
		telemetry(manifest.name),
	],
	// Around every request, before app/routes/_middleware.ts. staticFiles() serves the client
	// build on Bun; Cloudflare serves it as assets before the Worker runs.
	before: [staticFiles()],
	// Effect HttpRouter layers beside the file routes, e.g. an HttpApi.
	routes: [],
	// What a failed request answers: an HTML page for browsers, JSON for the rest.
	onError: errorPage,
});
