// The app's infrastructure: a plain Alchemy stack. `space deploy` runs `alchemy deploy configs/infra.ts`.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { Effect } from "effect";
import { variables } from "spacefn/infra";

import env from "#configs/env.ts";
// What the file conventions ask for (databases, queues, crons, ...), as plain data from app/.
import { app } from "#space/infra.ts";

export default Alchemy.Stack(
	app.name,
	{
		providers: Cloudflare.providers(),
		// Deploy state in your Cloudflare account, so CI and other machines share it. Local under `space dev`.
		state: process.env.ALCHEMY_DEV ? Alchemy.localState() : Cloudflare.state(),
	},
	Effect.gen(function* () {
		const stage = yield* Alchemy.Stage;
		const bindings: Record<string, any> = {
			// Kv and Blob. R2 must be enabled on the account; remove BLOB if the app doesn't use Blob.
			KV: yield* Cloudflare.KV.Namespace("KV"),
			BLOB: yield* Cloudflare.R2.Bucket("BLOB"),
			// The Durable Objects behind Bus and RateLimiter.
			SPACE_BUS: Cloudflare.DurableObject("SpaceBus"),
			SPACE_RATE_LIMITER: Cloudflare.DurableObject("SpaceRateLimiter"),
			// configs/env.ts's variables, from .env.<stage> or the environment; Env.secret ones as secrets.
			...variables(env),
			...variables({ OTEL_EXPORTER_OTLP_ENDPOINT: "plain", OTEL_EXPORTER_OTLP_HEADERS: "secret" }),
		};

		// app/db/<name>/: D1 here; a libSQL database reads DB_<NAME>_URL and DB_<NAME>_AUTH_TOKEN.
		for (const db of app.databases)
			if (db.driver === "d1") bindings[db.binding] = yield* Cloudflare.D1.Database(db.binding);
			else if (db.driver === "libsql")
				Object.assign(
					bindings,
					variables({ [`${db.binding}_URL`]: "plain", [`${db.binding}_AUTH_TOKEN`]: "secret" }),
				);

		// app/queues/<name>.ts: queue names are unique per account, so they carry the app and stage.
		const prefix = `${app.name}-${stage}-`.toLowerCase();
		bindings.SPACE_QUEUE_PREFIX = prefix;
		const queues: { binding: string; queue: Cloudflare.Queues.Queue }[] = [];
		for (const { name, binding } of app.queues) {
			const queue = yield* Cloudflare.Queues.Queue(binding, { name: prefix + name });
			bindings[binding] = queue;
			queues.push({ binding, queue });
		}

		// app/durable-objects/ and app/workflows/.
		for (const { className, binding } of app.durableObjects)
			bindings[binding] = Cloudflare.DurableObject(className);
		for (const { className, binding } of app.workflows)
			bindings[binding] = Cloudflare.Workflow(className, { className });

		// space dev --port N sets it; without one, 1337 or the next free port.
		const devPort = process.env.SPACE_DEV_PORT;
		const worker = yield* Cloudflare.Website.Vite("Worker", {
			// Vite runs in .space/: its vite.config.ts is configs/vite.ts, and entry.ts runs app/entry.ts.
			rootDir: ".space",
			main: "./entry.ts",
			crons: [...app.crons],
			env: bindings,
			dev: devPort ? { port: Number(devPort), strictPort: true } : undefined,
			// What a deploy hashes to tell whether to rebuild, from .space/.
			memo: {
				include: [
					"**/*",
					"../app/**",
					"../configs/**",
					"../package.json",
					...app.folders.map((folder) => `../${folder}/**`),
				],
				exclude: ["data/**"],
				lockfile: true,
			},
		});

		for (const { binding, queue } of queues)
			yield* Cloudflare.Queues.Consumer(`${binding}_CONSUMER`, {
				queueId: queue.queueId,
				scriptName: worker.workerName,
			});

		return { url: worker.url };
	}),
);
