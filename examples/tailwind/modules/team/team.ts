import { Effect, Schema } from "effect";

import Env from "#configs/env.ts";

export interface Member {
	readonly name: string;
	readonly role: string;
	readonly lead: boolean;
}

/** The team. */
const MEMBERS: readonly Member[] = [
	{ name: "Ada", role: "Engineering", lead: true },
	{ name: "Grace", role: "Engineering", lead: false },
	{ name: "Hedy", role: "Design", lead: true },
	{ name: "Katherine", role: "Research", lead: false },
];

/** The team's name, from configs/env.ts. */
export const title = Effect.gen(function* () {
	return (yield* Env).TEAM_NAME;
});

/** Everyone. An app would read them from a database; the example keeps them in code. */
export const members = Effect.succeed(MEMBERS);

/** What the live search sends: the page's signals, which this feature keeps under `team`. */
export const Search = Schema.Struct({ team: Schema.Struct({ query: Schema.String }) });

/** The members whose name or role contains `query`, ignoring case. */
export const search = (query: string): readonly Member[] => {
	const needle = query.trim().toLowerCase();
	return MEMBERS.filter((member) => `${member.name} ${member.role}`.toLowerCase().includes(needle));
};
