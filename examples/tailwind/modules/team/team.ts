import { Schema } from "effect";

export interface Member {
	readonly name: string;
	readonly role: string;
	readonly lead: boolean;
}

/** The team. An app would read it from a database; the example keeps it in code. */
export const MEMBERS: readonly Member[] = [
	{ name: "Ada", role: "Engineering", lead: true },
	{ name: "Grace", role: "Engineering", lead: false },
	{ name: "Hedy", role: "Design", lead: true },
	{ name: "Katherine", role: "Research", lead: false },
];

/** What the live search sends: the page's signals, which this feature keeps under `team`. */
export const Search = Schema.Struct({ team: Schema.Struct({ query: Schema.String }) });

/** The members whose name or role contains `query`, ignoring case. */
export const search = (query: string): readonly Member[] => {
	const needle = query.trim().toLowerCase();
	return MEMBERS.filter((member) => `${member.name} ${member.role}`.toLowerCase().includes(needle));
};
