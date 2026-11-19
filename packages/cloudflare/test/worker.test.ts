import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import { cron, defineEnv, Env, Kv, Queue, queue, route, type SpaceManifest } from "spacefn";

import { worker } from "../src/worker.ts";
import { fakeContext, fakeKv, fakeMessage, fakeQueue } from "./fakes.ts";

const AppEnv = defineEnv({ GREETING: Env.string() });

const at = (path: `/${string}`) =>
	({ kind: "route", path, params: [], file: `app/routes${path}.ts` }) as const;

const manifest = {
	name: "todo",
	env: { file: "app/env.ts", module: { default: AppEnv } },
	routes: [
		{
			...at("/hello"),
			module: {
				default: route({
					GET: Effect.gen(function* () {
						const { GREETING } = yield* AppEnv;
						const last = yield* (yield* Kv).get("last");
						return { greeting: GREETING, last: Option.getOrNull(last) };
					}),
					POST: Effect.gen(function* () {
						yield* (yield* Queue).send("emails", { to: "ada" }, { delay: "90 seconds" });
						return { queued: true };
					}),
				}),
			},
		},
	],
	middleware: [],
	queues: [
		{
			name: "emails",
			binding: "QUEUE_EMAILS",
			file: "app/queues/emails.ts",
			module: {
				default: queue({
					body: Schema.Struct({ to: Schema.String }),
					handler: ({ to }) =>
						Effect.gen(function* () {
							if (to === "bad") return yield* Effect.fail("smtp down");
							yield* (yield* Kv).set("last", `mailed ${to}`);
						}),
					retryDelay: "1 minute",
				}),
			},
		},
	],
	crons: [
		{
			name: "nightly",
			file: "app/crons/nightly.ts",
			module: {
				default: cron(
					"0 3 * * *",
					Effect.gen(function* () {
						yield* (yield* Kv).set("last", "nightly ran");
					}),
				),
			},
		},
	],
	db: [],
} as const satisfies SpaceManifest;

const setup = (vars: Record<string, string> = { GREETING: "hi" }) => {
	const { kv, values } = fakeKv();
	const { queue: emails, sent } = fakeQueue();
	const env = { ...vars, KV: kv, QUEUE_EMAILS: emails };
	return { app: worker(manifest), env, values, sent };
};

const get = async (app: ExportedHandler<any>, env: object, init?: RequestInit) => {
	const { ctx, settle } = fakeContext();
	const response = await app.fetch!(new Request("https://app.test/hello", init) as any, env, ctx);
	await settle();
	return response as unknown as Response;
};

describe("worker", () => {
	it("serves routes with Worker vars as config and bindings as services", async () => {
		const { app, env, sent } = setup();
		expect(await (await get(app, env)).json()).toEqual({ greeting: "hi", last: null });
		expect(await (await get(app, env, { method: "POST" })).json()).toEqual({ queued: true });
		expect(sent).toEqual([{ body: { to: "ada" }, options: { delaySeconds: 90 } }]);
	});

	it("hands each queue message to its consumer, through the deployed name", async () => {
		const { app, env, values } = setup();
		const ok = fakeMessage("1", { to: "ada" });
		const bad = fakeMessage("2", { to: "bad" });
		const { ctx, settle } = fakeContext();
		await app.queue!(
			{ queue: "todo-prod-emails", messages: [ok.message, bad.message] } as any,
			{ ...env, SPACE_QUEUE_NAMES: JSON.stringify({ "todo-prod-emails": "emails" }) },
			ctx,
		);
		await settle();
		expect(values.get("last")?.value).toBe("mailed ada");
		expect([ok.settled, bad.settled]).toEqual([["ack"], ["retry 60s"]]);
	});

	it("rejects a batch for a queue without a consumer, so it is redelivered", async () => {
		const { app, env } = setup();
		const { ctx } = fakeContext();
		await expect(app.queue!({ queue: "other", messages: [] } as any, env, ctx)).rejects.toThrow(
			/No consumer for queue "other"/,
		);
	});

	it("runs the crons on the schedule that fired", async () => {
		const { app, env, values } = setup();
		const { ctx } = fakeContext();
		await app.scheduled!({ cron: "*/5 * * * *", scheduledTime: 0, noRetry() {} }, env, ctx);
		expect(values.has("last")).toBe(false);
		await app.scheduled!({ cron: "0 3 * * *", scheduledTime: 0, noRetry() {} }, env, ctx);
		expect(values.get("last")?.value).toBe("nightly ran");
	});

	it("answers 500 when the app can't start, and says why in the log", async () => {
		const { app, env } = setup({});
		const errors: unknown[] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => void errors.push(args.join(" "));
		try {
			expect((await get(app, env)).status).toBe(500);
		} finally {
			console.error = original;
		}
		expect(String(errors[0])).toContain("GREETING");
	});
});
