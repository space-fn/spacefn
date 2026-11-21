import { Context, Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";

import { middleware, type Middleware } from "./middleware.ts";

/**
 * Where a target finds the files of the client build. Bun's production server
 * provides it (`dist/client`); Cloudflare serves them as assets before the
 * Worker runs, and Vite serves the sources in dev, so neither provides it.
 */
export class StaticFiles extends Context.Service<
	StaticFiles,
	{
		/** The file for a `GET` or `HEAD` of `path`, or `undefined` to let the app answer. */
		readonly lookup: (method: string, path: string) => Promise<Response | undefined>;
	}
>()("spacefn/StaticFiles") {}

/**
 * Serves the client build before anything else runs, for the entry's
 * `before`: where the target has {@link StaticFiles}, a request for one of
 * its files gets the file; every other request goes on to the app.
 */
export const staticFiles = (): Middleware =>
	middleware((next) =>
		Effect.gen(function* () {
			const files = yield* Effect.serviceOption(StaticFiles);
			if (files._tag === "None") return yield* next;
			const request = yield* HttpServerRequest.HttpServerRequest;
			const path = request.url.split("?")[0]!;
			const file = yield* Effect.promise(() => files.value.lookup(request.method, path));
			return file ? HttpServerResponse.fromWeb(file) : yield* next;
		}),
	);
