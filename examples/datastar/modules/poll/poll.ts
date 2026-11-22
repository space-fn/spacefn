import { Effect, Schema } from "effect";
import { Bus } from "spacefn";

import Env from "#configs/env.ts";
import MainDb from "#space/db/main.ts";

/** The Bus topic each vote is announced on. */
export const TOPIC = "poll";

/** The poll's question, from configs/env.ts. */
export const question = Effect.gen(function* () {
	return (yield* Env).QUESTION;
});

/** The answers, by the id a vote sends. */
export const CHOICES = {
	tabs: "Tabs",
	spaces: "Spaces",
	formatter: "Whatever the formatter says",
} as const;

export type Choice = keyof typeof CHOICES;

const choiceIds = Object.keys(CHOICES) as [Choice, ...Choice[]];

/**
 * What a vote sends: Datastar's `@post` sends the page's signals as JSON, and
 * this page keeps its own under `poll`.
 */
export const Vote = Schema.Struct({
	poll: Schema.Struct({ choice: Schema.Literals(choiceIds) }),
});

export interface Result {
	readonly id: Choice;
	readonly label: string;
	readonly votes: number;
	/** Of all votes, rounded. */
	readonly percent: number;
}

/** Each answer with its votes, in the order of {@link CHOICES}. */
export const results: Effect.Effect<readonly Result[], unknown, MainDb> = Effect.map(
	MainDb.tally(),
	(rows) => {
		const votes = new Map(rows.map((row) => [row.choice, row.n]));
		const total = rows.reduce((sum, row) => sum + row.n, 0);
		return choiceIds.map((id) => {
			const n = votes.get(id) ?? 0;
			return {
				id,
				label: CHOICES[id],
				votes: n,
				percent: total === 0 ? 0 : Math.round((n / total) * 100),
			};
		});
	},
);

/** Counts a vote, and tells every open page. */
export const vote = (choice: Choice) =>
	MainDb.addVote({ choice }).pipe(Effect.andThen(Bus.publish(TOPIC, "voted")));
