import { ConfigProvider, Duration, Effect, Layer, ManagedRuntime } from "effect";
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/http";
import { OtlpExporter } from "effect/observability";
import { formatSpaceError, SpaceError, type SpaceManifest } from "spacefn";
import {
	appLayer,
	consumeBatch,
	cronOf,
	httpLayer,
	noConsumer,
	queueConsumerOf,
	runSchedule,
	telemetry,
	type Delivery,
} from "spacefn/runtime";

import { CloudflareEnv, configProvider, type WorkerEnv } from "./bindings.ts";
import { busLayer } from "./bus.ts";
import { connectFor } from "./db.ts";
import { rateLimiterLayer } from "./rate-limiter.ts";
import { blobLayer, kvLayer, queueLayer } from "./storage.ts";

/**
 * Maps deployed queue names to the app's (`{ "todo-prod-emails": "emails" }`),
 * since queue names are unique per account. Set by the infra; without it a
 * queue's deployed name is its name.
 */
export const QUEUE_NAMES_VAR = "SPACE_QUEUE_NAMES";

/** Every service the target provides, on this Worker's bindings. */
export const platformLayer = (manifest: Pick<SpaceManifest, "name" | "queues">, env: WorkerEnv) =>
	Layer.mergeAll(
		kvLayer(env),
		blobLayer(env),
		queueLayer(env, manifest.queues),
		busLayer(env),
		rateLimiterLayer(env),
		Layer.succeed(CloudflareEnv, env),
		FetchHttpClient.layer,
		telemetry(manifest.name).pipe(Layer.provide(FetchHttpClient.layer)),
	).pipe(Layer.provideMerge(ConfigProvider.layer(configProvider(env))));

const makeApp = (manifest: SpaceManifest, env: WorkerEnv) => {
	const runtime = ManagedRuntime.make(
		appLayer(manifest, { platform: platformLayer(manifest, env), connect: connectFor(env) }),
	);
	const http = HttpRouter.toWebHandler(
		httpLayer(manifest, Layer.effectContext(runtime.contextEffect)).pipe(
			Layer.provide(HttpServer.layerServices),
		),
		{ memoMap: runtime.memoMap },
	);
	const queueNames: Record<string, string> = (() => {
		const names = env[QUEUE_NAMES_VAR];
		return typeof names === "string" ? JSON.parse(names) : {};
	})();
	const flush = (ctx: ExecutionContext) =>
		ctx.waitUntil(
			runtime
				.runPromise(
					Effect.gen(function* () {
						yield* (yield* OtlpExporter.Flusher).flush;
					}),
				)
				.catch(() => {}),
		);
	return { runtime, http, queueNames, flush };
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
 * The Worker for a manifest: what `.space/entry.ts` default-exports. The app
 * (its services, migrated databases and routes) is built once per isolate, on
 * the first event, and shared by requests, queue batches and crons. Telemetry
 * is flushed with `waitUntil` after each, so it doesn't delay the response.
 */
export const worker = (manifest: SpaceManifest): ExportedHandler<WorkerEnv> => {
	const apps = new WeakMap<object, ReturnType<typeof makeApp>>();
	const appFor = (env: WorkerEnv) => {
		let app = apps.get(env);
		if (!app) apps.set(env, (app = makeApp(manifest, env)));
		return app;
	};

	return {
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
			const name = app.queueNames[batch.queue] ?? batch.queue;
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
