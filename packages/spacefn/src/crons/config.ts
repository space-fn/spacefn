import { triggers } from "cf/config";

/** One scheduled trigger per distinct schedule. Jobs sharing a schedule run together. */
export function cronConfig(schedules: string[]) {
	return { triggers: [...new Set(schedules)].map((schedule) => triggers.scheduled({ schedule })) };
}
