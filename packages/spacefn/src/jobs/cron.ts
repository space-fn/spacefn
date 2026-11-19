import { Effect, Exit, Predicate } from "effect";

import { SpaceError } from "../errors.ts";
import type { ManifestCron, Unchecked } from "../manifest.ts";

const CronTypeId = "~spacefn/Cron";

export interface Cron<E = any, R = any> {
	readonly [CronTypeId]: typeof CronTypeId;
	/** Five fields: minute hour day-of-month month day-of-week, in UTC. */
	readonly schedule: string;
	readonly job: Effect.Effect<void, E, R>;
}

/**
 * Declares a scheduled job, the default export of a file in `app/crons/`.
 * The schedule is a five-field cron expression in UTC.
 *
 * ```ts
 * export default cron("0 3 * * *", Sessions.deleteExpired);
 * ```
 */
export const cron = <E, R>(schedule: string, job: Effect.Effect<void, E, R>): Cron<E, R> => ({
	[CronTypeId]: CronTypeId,
	schedule: schedule.trim().split(/\s+/).join(" "),
	job,
});

export const isCron = (value: unknown): value is Cron => Predicate.hasProperty(value, CronTypeId);

const FIELD = /^[\d*,/-]+$|^[A-Za-z]{3}(-[A-Za-z]{3})?$/;

/** The job of a manifest entry, or a SpaceError for a wrong export or a malformed schedule. */
export const cronOf = (entry: Unchecked<ManifestCron>): Effect.Effect<Cron, SpaceError> => {
	const value = (entry.module as { default?: unknown }).default;
	if (!isCron(value))
		return Effect.fail(
			new SpaceError({
				code: "CRON_EXPORT",
				message: "The default export is not a cron job",
				hint: 'Export the job with: export default cron("0 3 * * *", job)',
				file: entry.file,
			}),
		);
	const fields = value.schedule.split(" ");
	if (fields.length !== 5 || !fields.every((field) => FIELD.test(field)))
		return Effect.fail(
			new SpaceError({
				code: "CRON_SCHEDULE",
				message: `"${value.schedule}" is not a five-field cron expression`,
				hint: "Use minute hour day-of-month month day-of-week, e.g. 0 3 * * *",
				file: entry.file,
			}),
		);
	return Effect.succeed(value);
};

/**
 * Runs every job whose schedule fired, at once, each in a `cron.run` span.
 * One failing job doesn't stop the others; if any failed, the run dies after
 * all finish, so the platform records the invocation as failed.
 */
export const runSchedule = (
	jobs: ReadonlyArray<{ readonly name: string; readonly cron: Cron }>,
	schedule: string,
): Effect.Effect<void, never, any> => {
	const due = jobs.filter((job) => job.cron.schedule === schedule);
	return Effect.forEach(
		due,
		({ name, cron }) =>
			cron.job.pipe(
				Effect.tapCause((cause) => Effect.logError(`Cron ${name} failed`, cause)),
				Effect.withSpan("cron.run", {
					attributes: { "cron.job": name, "cron.schedule": schedule },
				}),
				Effect.exit,
			),
		{ concurrency: "unbounded" },
	).pipe(
		Effect.flatMap((exits) => {
			const failed = due.filter((_, i) => Exit.isFailure(exits[i]!));
			return failed.length === 0
				? Effect.void
				: Effect.die(new Error(`Cron jobs failed: ${failed.map((job) => job.name).join(", ")}`));
		}),
		Effect.withSpan("cron", { attributes: { "cron.schedule": schedule, "cron.jobs": due.length } }),
	);
};
