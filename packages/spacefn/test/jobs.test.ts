import { describe, expect, it } from "@effect/vitest";
import { Context, Duration, Effect, Exit, Layer, Ref, Schema } from "effect";

import { cron, cronMatches, cronOf, runSchedule } from "../src/jobs/cron.ts";
import { consumeBatch, queue, queueConsumerOf, type Delivery } from "../src/jobs/queue.ts";

class Log extends Context.Service<Log, Ref.Ref<string[]>>()("test/Log") {}
const withLog = Layer.effect(Log, Ref.make<string[]>([]));
const note = (line: string) =>
	Effect.gen(function* () {
		yield* Ref.update(yield* Log, (lines) => [...lines, line]);
	});
const lines = Effect.gen(function* () {
	return yield* Ref.get(yield* Log);
});

const settled: string[] = [];
const delivery = (id: string, body: unknown): Delivery => ({
	id,
	body,
	attempts: 1,
	ack: Effect.sync(() => void settled.push(`ack ${id}`)),
	retry: (delay) =>
		Effect.sync(
			() => void settled.push(`retry ${id}${delay ? ` ${Duration.toSeconds(delay)}s` : ""}`),
		),
});

const entry = (module: unknown) => ({
	name: "emails",
	binding: "QUEUE_EMAILS",
	file: "app/queues/emails.ts",
	module,
});

describe("queue", () => {
	it.effect("acks handled messages and retries failed or invalid ones", () =>
		Effect.gen(function* () {
			const consumer = queue({
				body: Schema.Struct({ to: Schema.String }),
				handler: ({ to }, message) =>
					to === "bad"
						? Effect.fail("smtp down")
						: Effect.sync(() => void settled.push(`sent ${to} #${message.attempts}`)),
				retryDelay: "30 seconds",
			});
			yield* consumeBatch("emails", yield* queueConsumerOf(entry({ default: consumer })), [
				delivery("1", { to: "ada" }),
				delivery("2", { to: "bad" }),
				delivery("3", { nope: true }),
			]);
			expect(settled).toEqual(["sent ada #1", "ack 1", "retry 2 30s", "retry 3 30s"]);
		}),
	);

	it.effect("rejects a file that doesn't export a consumer", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(queueConsumerOf(entry({ default: () => {} })));
			expect(error.code).toBe("QUEUE_EXPORT");
		}),
	);
});

describe("cron", () => {
	const job = (name: string, schedule: string, run: Effect.Effect<void, string, Log>) => ({
		name,
		cron: cron(schedule, run),
	});

	it.effect("runs only the jobs on the schedule that fired, and all of them", () =>
		Effect.gen(function* () {
			const jobs = [
				job("a", "0 3 * * *", note("a")),
				job("b", "0  3 * * *", note("b")),
				job("c", "*/5 * * * *", note("c")),
			];
			yield* runSchedule(jobs, "0 3 * * *");
			expect([...(yield* lines)].sort()).toEqual(["a", "b"]);
		}).pipe(Effect.provide(withLog)),
	);

	it.effect("finishes the other jobs when one fails, then fails the run", () =>
		Effect.gen(function* () {
			const exit = yield* Effect.exit(
				runSchedule(
					[job("broken", "* * * * *", Effect.fail("boom")), job("ok", "* * * * *", note("ok"))],
					"* * * * *",
				),
			);
			expect(Exit.isFailure(exit)).toBe(true);
			expect(String(exit)).toContain("Cron jobs failed: broken");
			expect(yield* lines).toEqual(["ok"]);
		}).pipe(Effect.provide(withLog)),
	);

	it.effect("checks the export and the schedule", () =>
		Effect.gen(function* () {
			const at = (module: unknown) => ({ name: "x", file: "app/crons/x.ts", module });
			expect((yield* Effect.flip(cronOf(at({ default: {} })))).code).toBe("CRON_EXPORT");
			expect((yield* Effect.flip(cronOf(at({ default: cron("daily", Effect.void) })))).code).toBe(
				"CRON_SCHEDULE",
			);
			expect((yield* cronOf(at({ default: cron("0 9 * * MON-FRI", Effect.void) }))).schedule).toBe(
				"0 9 * * MON-FRI",
			);
		}),
	);

	it("matches schedules by UTC minute", () => {
		// A Wednesday.
		const at = (iso: string) => new Date(`2026-11-18T${iso}:00Z`);
		expect(cronMatches("0 3 * * *", at("03:00"))).toBe(true);
		expect(cronMatches("0 3 * * *", at("03:01"))).toBe(false);
		expect(cronMatches("*/15 * * * *", at("10:45"))).toBe(true);
		expect(cronMatches("*/15 * * * *", at("10:50"))).toBe(false);
		expect(cronMatches("5/20 * * * *", at("10:45"))).toBe(true);
		expect(cronMatches("0 9-17 * * MON-FRI", at("12:00"))).toBe(true);
		expect(cronMatches("0 9 * * SAT,SUN", at("09:00"))).toBe(false);
		expect(cronMatches("0 9 * NOV 3", at("09:00"))).toBe(true);
		expect(cronMatches("0 0 * * 7", new Date("2026-11-22T00:00:00Z"))).toBe(true);
		// Both day fields restricted: either one fires.
		expect(cronMatches("0 9 1 * WED", at("09:00"))).toBe(true);
		expect(cronMatches("0 9 18 * MON", at("09:00"))).toBe(true);
		expect(cronMatches("0 9 1 * MON", at("09:00"))).toBe(false);
	});

	it.effect("rejects schedules it can't run", () =>
		Effect.gen(function* () {
			for (const schedule of [
				"61 * * * *",
				"* * * *",
				"*/0 * * * *",
				"5-1 * * * *",
				"* * * FOO *",
			]) {
				const entry = {
					name: "x",
					file: "app/crons/x.ts",
					module: { default: cron(schedule, Effect.void) },
				};
				expect((yield* Effect.flip(cronOf(entry))).code).toBe("CRON_SCHEDULE");
			}
		}),
	);
});
