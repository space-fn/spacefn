import { html } from "spacefn";

import { badge, card } from "#lib/ui/components.ts";

import type { Member } from "./team.ts";

/** The members as cards. Datastar swaps the list in by its id as the search changes. */
export const memberList = (props: { readonly members: readonly Member[] }) =>
	html`<ul id="${memberList.id}" class="grid gap-3 sm:grid-cols-2">
		${
			props.members.length === 0
				? html`<li class="text-gray-500">No one matches.</li>`
				: props.members.map(
						(member) =>
							html`<li>
								${card(
									html`<h2 class="text-lg font-semibold">${member.name}</h2>
										<p class="mt-1 flex gap-2">
											${badge(member.role)} ${member.lead ? badge("Lead", "brand") : ""}
										</p>`,
								)}
							</li>`,
					)
		}
	</ul>`;
memberList.id = "team-members";

/** The page's body: the title, the search box and the list. */
export const teamPage = (props: {
	readonly title: string;
	/** What the search box asks for as you type. */
	readonly search: string;
	readonly members: readonly Member[];
}) =>
	html`<main class="mx-auto max-w-2xl space-y-6 p-6" data-signals="{team: {query: ''}}">
		<h1 class="text-brand-700 dark:text-brand-50 text-3xl font-bold">${props.title}</h1>
		<input
			type="search"
			placeholder="Search by name or role"
			class="rounded-card focus:outline-brand-600 w-full border border-gray-300 px-3 py-2 focus:outline-2 dark:border-gray-700 dark:bg-gray-900"
			data-bind:team.query
			data-on:input__debounce.200ms="@get('${props.search}')"
		/>
		${memberList({ members: props.members })}
	</main>`;
