import { runWithBindings } from "../env/current";
import { traceBindings } from "../trace/bindings";
import { getTracer, withSpan } from "../trace/span";
import type { CronContext, CronEvent, CronJob } from "./define";

/**
 * Runs every job whose schedule fired, each in a `cron.run` span under one
 * `cron` span. A failing job is recorded and rethrown after the others finish,
 * so one job cannot stop another.
 */
export async function dispatchScheduled(
	event: CronEvent,
	env: object,
	ctx: CronContext,
	jobs: Record<string, CronJob>,
): Promise<void> {
	const bindings = traceBindings(env);
	const due = Object.entries(jobs).filter(([, job]) => job.schedule === event.cron);

	await runWithBindings(bindings, () =>
		withSpan(
			"cron",
			async (span) => {
				span.setAttributes({ "cron.schedule": event.cron, "cron.jobs": due.length });
				const results = await Promise.allSettled(
					due.map(([name, job]) =>
						withSpan("cron.run", () => job.run(event, bindings, ctx), {
							attributes: { "cron.job": name },
						}),
					),
				);
				const failures = results.flatMap((result) =>
					result.status === "rejected" ? [result.reason] : [],
				);
				if (failures.length > 0) {
					throw new AggregateError(failures, `${failures.length} scheduled job(s) failed`);
				}
			},
			{ kind: "internal" },
		),
	);

	const flush = getTracer()?.flush;
	if (flush) ctx.waitUntil(flush.call(getTracer()));
}
