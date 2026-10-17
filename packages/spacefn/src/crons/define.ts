export interface CronEvent {
	/** The schedule that fired, e.g. `0 3 * * *`. */
	readonly cron: string;
	readonly scheduledTime: number;
}

/** The part of the Workers `ExecutionContext` that scheduled jobs use. */
export interface CronContext {
	waitUntil(promise: Promise<unknown>): void;
}

export type CronHandler = (
	event: CronEvent,
	env: unknown,
	ctx: CronContext,
) => void | Promise<void>;

export interface CronJob {
	readonly schedule: string;
	readonly run: CronHandler;
}

/**
 * Declares a scheduled job. The default export of `crons/<name>.ts`. The job is
 * named after its file, and runs whenever its schedule fires.
 */
export function defineCron(schedule: string, run: CronHandler): CronJob {
	if (schedule.trim().split(/\s+/).length !== 5) {
		throw new Error(`defineCron schedule must be a 5-field cron expression, got "${schedule}"`);
	}
	return { schedule, run };
}
