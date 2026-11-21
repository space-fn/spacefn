import { ConfigProvider, Duration, Effect, Layer, ManagedRuntime } from "effect";
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/http";
import { OtlpExporter } from "effect/observability";
import { formatSpaceError, SpaceError, type SpaceApp, type SpaceManifest } from "spacefn";
import {
	appServices,
	consumeBatch,
	cronOf,
	DbConnector,
	httpLayer,
	noConsumer,
	queueConsumerOf,
	runSchedule,
	type Delivery,
} from "spacefn/runtime";

import { CloudflareEnv, configProvider, type WorkerEnv } from "./bindings.ts";
import { busLayer } from "./bus.ts";
import { connectFor } from "./db.ts";
import { rateLimiterLayer } from "./rate-limiter.ts";
import { blobLayer, kvLayer, queueLayer } from "./storage.ts";

/**
 * What `configs/infra.ts` puts before each queue's name (`todo-prod-` for
 * `todo-prod-emails`), since queue names are unique per account. The Worker
 * strips it to find the queue's file in `app/queues/`; without it a queue's
 * deployed name is its name.
 */
export const QUEUE_PREFIX_VAR = "SPACE_QUEUE_PREFIX";

/**
 * The Cloudflare target's services, for the entry's `services` (through
 * `spacefn/platform`): Kv, Blob, Queue, Bus and RateLimiter on the Worker's
 * bindings, an `HttpClient`, how databases connect (D1 or libSQL), and the
 * Worker's vars and secrets as config. It reads the bindings from
 * `CloudflareEnv`, which the Worker provides.
 */
export const platform = (manifest: Pick<SpaceManifest, "queues">) =>
	Layer.unwrap(
		Effect.gen(function* () {
			const env = yield* CloudflareEnv;
			return Layer.mergeAll(
				kvLayer(env),
				blobLayer(env),
				queueLayer(env, manifest.queues),
				busLayer(env),
				rateLimiterLayer(env),
				FetchHttpClient.layer,
				Layer.succeed(DbConnector, connectFor(env)),
			).pipe(Layer.provideMerge(ConfigProvider.layer(configProvider(env))));
		}),
	);

const makeApp = (space: SpaceApp, env: WorkerEnv) => {
	const { manifest } = space;
	// The Worker's bindings, for the platform and for the app's own code.
	const runtime = ManagedRuntime.make(
		appServices(space).pipe(Layer.provideMerge(Layer.succeed(CloudflareEnv, env))) as Layer.Layer<
			any,
			unknown
		>,
	);
	const http = HttpRouter.toWebHandler(
		httpLayer(manifest, Layer.effectContext(runtime.contextEffect), {
			before: space.options.before ?? [],
			routes: space.options.routes ?? [],
		}).pipe(Layer.provide(HttpServer.layerServices)),
		{ memoMap: runtime.memoMap },
	);
	const prefix = env[QUEUE_PREFIX_VAR];
	const queueName = (deployed: string) =>
		typeof prefix === "string" && deployed.startsWith(prefix)
			? deployed.slice(prefix.length)
			: deployed;
	const flush = (ctx: ExecutionContext) =>
		ctx.waitUntil(
			runtime
				.runPromise(
					Effect.gen(function* () {
						// Telemetry is the entry's choice; without it there is nothing to flush.
						const flusher = yield* Effect.serviceOption(OtlpExporter.Flusher);
						if (flusher._tag === "Some") yield* flusher.value.flush;
					}),
				)
				.catch(() => {}),
		);
	return { runtime, http, queueName, flush };
};

const logError = (error: unknown) =>
	console.error(error instanceof SpaceError ? formatSpaceError(error) : error);

/** The jobs of `app/crons/`, checked. Cheap, so it runs for each event. */
const cronsOf = (manifest: SpaceManifest) =>
	Effect.forEach(manifest.crons, (entry) =>
		Effect.map(cronOf(entry), (cron) => ({ name: entry.name, cron })),
	);

const delivery = (message: Message): Delivery => ({
	id: message.id,
	body: message.body,
	attempts: message.attempts,
	ack: Effect.sync(() => message.ack()),
	retry: (delay) =>
		Effect.sync(() =>
			message.retry(
				delay === undefined ? undefined : { delaySeconds: Math.ceil(Duration.toSeconds(delay)) },
			),
		),
});

/**
 * Runs `app/entry.ts` as a Worker: what `.space/entry.ts` default-exports. The
 * app (its services, migrated databases and routes) is built once per
 * isolate, on the first event, and shared by requests, queue batches and
 * crons. Telemetry is flushed with `waitUntil` after each, so it doesn't delay
 * the response. The entry's `cloudflare.handlers` are added as they are.
 */
export const worker = (space: SpaceApp): ExportedHandler<WorkerEnv> => {
	const { manifest } = space;
	const apps = new WeakMap<object, ReturnType<typeof makeApp>>();
	const appFor = (env: WorkerEnv) => {
		let app = apps.get(env);
		if (!app) apps.set(env, (app = makeApp(space, env)));
		return app;
	};

	return {
		...space.options.cloudflare?.handlers,
		async fetch(request, env, ctx) {
			const app = appFor(env);
			try {
				return await app.http.handler(request as unknown as Request);
			} catch (error) {
				logError(error);
				return Response.json({ error: "InternalServerError" }, { status: 500 });
			} finally {
				app.flush(ctx);
			}
		},

		async queue(batch, env, ctx) {
			const app = appFor(env);
			const name = app.queueName(batch.queue);
			try {
				await app.runtime.runPromise(
					Effect.gen(function* () {
						const entry = manifest.queues.find((queue) => queue.name === name);
						if (!entry) return yield* noConsumer(name);
						const consumer = yield* queueConsumerOf(entry);
						yield* consumeBatch(name, consumer, batch.messages.map(delivery));
					}),
				);
			} catch (error) {
				// Logged readably, then rethrown so the platform retries the batch or records the failure.
				logError(error);
				throw error;
			} finally {
				app.flush(ctx);
			}
		},

		async scheduled(controller, env, ctx) {
			const app = appFor(env);
			try {
				await app.runtime.runPromise(
					Effect.gen(function* () {
						yield* runSchedule(yield* cronsOf(manifest), controller.cron);
					}),
				);
			} catch (error) {
				// Logged readably, then rethrown so the platform retries the batch or records the failure.
				logError(error);
				throw error;
			} finally {
				app.flush(ctx);
			}
		},
	};
};
