import { Effect } from "effect";

export interface Release {
	readonly version: string;
	/** `YYYY-MM-DD`. */
	readonly date: string;
	readonly notes: readonly string[];
}

/** The releases, newest first. */
const RELEASES: readonly Release[] = [
	{
		version: "1.1.0",
		date: "2026-11-02",
		notes: ["Dark mode follows the system", "Faster search"],
	},
	{ version: "1.0.0", date: "2026-10-01", notes: ["First release"] },
];

/** The releases, newest first. An app would read them from a database; the example keeps them in code. */
export const list = Effect.succeed(RELEASES);
