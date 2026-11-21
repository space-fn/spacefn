import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { Effect } from "effect";

import type { InfraConfig } from "./infra-config.ts";
import { deployVariables } from "./variables.ts";

/** What codegen knows about the app, as `.space/alchemy.run.ts` passes it. */
export interface CloudflareApp {
	readonly name: string;
	/** `.space/`, where Vite's config and the Worker entry are. */
	readonly rootDir: string;
	readonly db: readonly { readonly driver: string; readonly binding: string }[];
	readonly queues: readonly { readonly name: string; readonly binding: string }[];
	/** Every cron schedule, each once. */
	readonly crons: readonly string[];
	readonly durableObjects: readonly { readonly className: string; readonly binding: string }[];
	readonly workflows: readonly { readonly className: string; readonly binding: string }[];
	readonly uses: { readonly kv: boolean; readonly blob: boolean };
	/** Alias folders, hashed with `app/` to tell whether a deploy must rebuild. */
	readonly folders: readonly string[];
}

export interface CloudflareStackOptions {
	readonly env?: { readonly fields: Readonly<Record<string, unknown>> } | undefined;
	readonly infra?: InfraConfig | undefined;
}

/**
 * The Alchemy stack for a Cloudflare app: every binding `spacefn/cloudflare`
 * reads (D1 by `DB_<NAME>`, `KV` and `BLOB` when the app uses them, a queue
 * and its consumer per `app/queues/` file, the `SpaceBus` and
 * `SpaceRateLimiter` Durable Objects, the app's own Durable Objects and
 * workflows), the crons, the app's variables, then `configs/infra.ts`.
 */
export const cloudflareStack = (app: CloudflareApp, options: CloudflareStackOptions = {}) =>
	Alchemy.Stack(
		app.name,
		{ providers: Cloudflare.providers(), state: Alchemy.localState() },
		Effect.gen(function* () {
			const bindings: Record<string, any> = {};
			for (const db of app.db)
				if (db.driver === "d1") bindings[db.binding] = yield* Cloudflare.D1.Database(db.binding);
			if (app.uses.kv) bindings.KV = yield* Cloudflare.KV.Namespace("KV");
			if (app.uses.blob) bindings.BLOB = yield* Cloudflare.R2.Bucket("BLOB");
			const queues: { binding: string; queue: Cloudflare.Queues.Queue }[] = [];
			// Queue names are unique per account, so they carry the app and stage; the Worker strips it.
			const prefix = `${app.name}-${yield* Alchemy.Stage}-`.toLowerCase();
			if (app.queues.length > 0) bindings.SPACE_QUEUE_PREFIX = prefix;
			for (const { name, binding } of app.queues) {
				const queue = yield* Cloudflare.Queues.Queue(binding, { name: prefix + name });
				bindings[binding] = queue;
				queues.push({ binding, queue });
			}
			bindings.SPACE_BUS = Cloudflare.DurableObject("SpaceBus");
			bindings.SPACE_RATE_LIMITER = Cloudflare.DurableObject("SpaceRateLimiter");
			for (const { className, binding } of app.durableObjects)
				bindings[binding] = Cloudflare.DurableObject(className);
			for (const { className, binding } of app.workflows)
				bindings[binding] = Cloudflare.Workflow(className, { className });
			Object.assign(
				bindings,
				deployVariables({
					env: options.env,
					libsql: app.db.filter((db) => db.driver === "libsql").map((db) => db.binding),
				}),
			);
			const extra = options.infra?.cloudflare;
			if (extra?.bindings) Object.assign(bindings, yield* extra.bindings);

			const worker = yield* Cloudflare.Website.Vite("Worker", {
				rootDir: app.rootDir,
				main: "./entry.ts",
				crons: [...app.crons],
				env: bindings,
				memo: {
					// Alchemy hashes rootDir (.space/) by default; the app lives one level up.
					include: [
						"**/*",
						"../app/**",
						"../configs/**",
						"../package.json",
						...app.folders.map((folder) => `../${folder}/**`),
					],
					exclude: [".alchemy/**", "data/**", "../dist/**"],
					lockfile: true,
				},
				...extra?.worker,
			} as Cloudflare.Website.ViteProps<any>);
			for (const { binding, queue } of queues)
				yield* Cloudflare.Queues.Consumer(`${binding}_CONSUMER`, {
					queueId: queue.queueId,
					scriptName: worker.workerName,
				});
			return { url: worker.url };
		}),
	);
