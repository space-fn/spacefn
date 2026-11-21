import { Clock, Effect } from "effect";
import type { SpaceManifest } from "spacefn";
import { cronMatches, cronOf, runSchedule } from "spacefn/internal/runtime";

/**
 * Runs the jobs of `app/crons/` at the start of each UTC minute their schedule
 * matches, forever. Each run is forked, so a long job doesn't delay the next
 * minute. Run it in one process only, or jobs run once per process.
 */
export const runCrons = (manifest: Pick<SpaceManifest, "crons">) =>
	Effect.gen(function* () {
		const jobs = yield* Effect.forEach(manifest.crons, (entry) =>
			Effect.map(cronOf(entry), (cron) => ({ name: entry.name, cron })),
		);
		const schedules = [...new Set(jobs.map((job) => job.cron.schedule))];
		return yield* Effect.forever(
			Effect.gen(function* () {
				const now = yield* Clock.currentTimeMillis;
				const minute = now - (now % 60_000) + 60_000;
				yield* Effect.sleep(minute - now);
				const at = new Date(minute);
				for (const schedule of schedules)
					if (cronMatches(schedule, at))
						// Failures are logged by runSchedule; the next minute runs regardless.
						yield* Effect.forkChild(Effect.asVoid(Effect.exit(runSchedule(jobs, schedule))));
			}),
		);
	});
