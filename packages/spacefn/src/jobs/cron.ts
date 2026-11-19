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

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface Field {
	readonly min: number;
	readonly max: number;
	/** Names for the values from `min` on, e.g. JAN for 1. */
	readonly names?: readonly string[];
}

const FIELDS: readonly Field[] = [
	{ min: 0, max: 59 },
	{ min: 0, max: 23 },
	{ min: 1, max: 31 },
	{ min: 1, max: 12, names: MONTHS },
	// 7 is Sunday too.
	{ min: 0, max: 7, names: DAYS },
];

/** The values a field allows, or undefined when it is malformed. */
const parseField = (text: string, field: Field): Set<number> | undefined => {
	const value = (part: string) => {
		const named = field.names?.indexOf(part.toUpperCase()) ?? -1;
		if (named >= 0) return field.min + named;
		if (!/^\d+$/.test(part)) return undefined;
		const n = Number(part);
		return n >= field.min && n <= field.max ? n : undefined;
	};
	const values = new Set<number>();
	for (const item of text.split(",")) {
		const [range = "", stepText, ...rest] = item.split("/");
		const step = stepText === undefined ? 1 : /^\d+$/.test(stepText) ? Number(stepText) : 0;
		if (rest.length > 0 || step < 1) return undefined;
		let from: number | undefined;
		let to: number | undefined;
		if (range === "*") [from, to] = [field.min, field.max];
		else {
			const [a = "", b, ...more] = range.split("-");
			if (more.length > 0) return undefined;
			from = value(a);
			// `5/15` means from 5 to the end, every 15.
			to = b === undefined ? (stepText === undefined ? from : field.max) : value(b);
		}
		if (from === undefined || to === undefined || from > to) return undefined;
		for (let n = from; n <= to; n += step) values.add(n);
	}
	return values;
};

interface Schedule {
	readonly fields: readonly Set<number>[];
	readonly anyDayOfMonth: boolean;
	readonly anyDayOfWeek: boolean;
}

const parseSchedule = (schedule: string): Schedule | undefined => {
	const texts = schedule.split(" ");
	if (texts.length !== 5) return undefined;
	const fields: Set<number>[] = [];
	for (const [i, text] of texts.entries()) {
		const values = parseField(text, FIELDS[i]!);
		if (!values) return undefined;
		fields.push(values);
	}
	if (fields[4]!.delete(7)) fields[4]!.add(0);
	return { fields, anyDayOfMonth: texts[2] === "*", anyDayOfWeek: texts[4] === "*" };
};

/** Whether `schedule` (whitespace already collapsed) is a five-field expression this runs. */
export const isValidSchedule = (schedule: string): boolean => parseSchedule(schedule) !== undefined;

/**
 * Whether a five-field schedule fires in the UTC minute of `at`. As in cron,
 * when both day fields are restricted a day matching either one fires.
 */
export const cronMatches = (schedule: string, at: Date): boolean => {
	const parsed = parseSchedule(schedule);
	if (!parsed) return false;
	const [minute, hour, dayOfMonth, month, dayOfWeek] = parsed.fields as [
		Set<number>,
		Set<number>,
		Set<number>,
		Set<number>,
		Set<number>,
	];
	const domOk = dayOfMonth.has(at.getUTCDate());
	const dowOk = dayOfWeek.has(at.getUTCDay());
	const dayOk = parsed.anyDayOfMonth || parsed.anyDayOfWeek ? domOk && dowOk : domOk || dowOk;
	return (
		minute.has(at.getUTCMinutes()) &&
		hour.has(at.getUTCHours()) &&
		month.has(at.getUTCMonth() + 1) &&
		dayOk
	);
};

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
	if (!parseSchedule(value.schedule))
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
