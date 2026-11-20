import { Cause, Context, Effect, Fiber, Layer, ManagedRuntime, Option } from "effect";
import { FetchHttpClient, HttpRouter, HttpServer, HttpServerRequest } from "effect/http";
import { formatSpaceError, SpaceError, type SpaceManifest } from "spacefn";
import { appLayer, httpLayer, telemetry } from "spacefn/runtime";

import { blobLayer } from "./blob.ts";
import { busLayer } from "./bus.ts";
import { runCrons } from "./cron.ts";
import { connect } from "./db.ts";
import { kvLayer } from "./kv.ts";
import { consumeQueues, queueLayer } from "./queue.ts";
import { rateLimiterLayer } from "./rate-limiter.ts";
import { SpaceState } from "./state.ts";

/** Every service the target provides. Config comes from the environment (Bun loads `.env`). */
export const platformLayer = (manifest: Pick<SpaceManifest, "name" | "queues">) =>
	Layer.mergeAll(kvLayer, rateLimiterLayer, queueLayer(manifest.queues), busLayer).pipe(
		// Kept in the app's context too: the queue consumers claim from it.
		Layer.provideMerge(SpaceState.layer),
		Layer.merge(blobLayer()),
		Layer.merge(FetchHttpClient.layer),
		Layer.merge(telemetry(manifest.name).pipe(Layer.provide(FetchHttpClient.layer))),
	);

/** The client's address from the server, for `clientAddress`. */
class ClientIp extends Context.Service<ClientIp, string | undefined>()("spacefn/bun/ClientIp") {}

export interface BunApp {
	readonly manifest: SpaceManifest;
	/** The app's services, built once, on first use; queue and cron processes run on it too. */
	readonly runtime: ManagedRuntime.ManagedRuntime<any, unknown>;
	/** Answers a request. A failure to start is logged and answered with a 500. */
	readonly fetch: (request: Request, clientIp?: string) => Promise<Response>;
	/**
	 * Runs the queue consumers and crons in this process, for the dev server;
	 * `serve` runs them in their own processes instead. Returns how to stop them.
	 */
	readonly startJobs: () => () => Promise<void>;
	/** Stops the app: open requests are cut, then services are closed (telemetry is flushed). */
	readonly dispose: () => Promise<void>;
}

export const logError = (error: unknown) =>
	console.error(error instanceof SpaceError ? formatSpaceError(error) : error);

/**
 * The app for a manifest: what `.space/app.ts` default-exports. The Vite dev
 * server calls its `fetch`; `serve` runs it in production.
 */
export const app = (manifest: SpaceManifest): BunApp => {
	const runtime = ManagedRuntime.make(
		appLayer(manifest, { platform: platformLayer(manifest), connect }),
	);
	const http = HttpRouter.toWebHandler(
		httpLayer(manifest, Layer.effectContext(runtime.contextEffect)).pipe(
			Layer.provide(HttpServer.layerServices),
		),
		{
			memoMap: runtime.memoMap,
			middleware: (handle) =>
				Effect.gen(function* () {
					const ip = yield* ClientIp;
					return yield* ip === undefined
						? handle
						: Effect.updateService(handle, HttpServerRequest.HttpServerRequest, (request) =>
								request.modify({ remoteAddress: Option.some(ip) }),
							);
				}),
		},
	);
	return {
		manifest,
		runtime,
		fetch: async (request, clientIp) => {
			try {
				return await http.handler(request, Context.make(ClientIp, clientIp));
			} catch (error) {
				logError(error);
				return Response.json({ error: "InternalServerError" }, { status: 500 });
			}
		},
		startJobs: () => {
			const jobs = runtime.runFork(
				Effect.all([consumeQueues(manifest), runCrons(manifest)], {
					concurrency: "unbounded",
					discard: true,
				}).pipe(
					Effect.tapCause((cause) =>
						Cause.hasInterruptsOnly(cause)
							? Effect.void
							: Effect.logError("Queues and crons stopped", cause),
					),
				),
			);
			return () => Effect.runPromise(Fiber.interrupt(jobs)).then(() => undefined);
		},
		dispose: async () => {
			await http.dispose();
			await runtime.dispose();
		},
	};
};
