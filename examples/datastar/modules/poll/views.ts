import { html } from "spacefn";

import { CHOICES, type Result } from "./poll.ts";

// Components are functions from plain props to html. One that Datastar patches
// keeps a fixed id, exported beside it, and the page's signals live under `poll.`.

/** The page's signals: what was picked, and what the server counted. */
export const signals = `{poll: {choice: '', voted: ''}}`;

/** A button per answer. Clicking sets `$poll.choice` and posts the signals to `vote`. */
export const ballot = (props: { readonly vote: string }) =>
	html`<div id="${ballot.id}" class="ballot">
		${Object.entries(CHOICES).map(
			([id, label]) =>
				html`<button
					type="button"
					data-class:chosen="$poll.voted === '${id}'"
					data-on:click="$poll.choice = '${id}'; @post('${props.vote}')"
				>
					${label}
				</button>`,
		)}
	</div>`;
ballot.id = "poll-ballot";

/** The results, as `<poll-meter>` elements. Datastar swaps the list in by its id after each vote. */
export const results = (props: { readonly results: readonly Result[] }) =>
	html`<ol id="${results.id}" class="results">
		${props.results.map(
			(result) =>
				html`<li>
					<poll-meter label="${result.label}" value="${result.percent}"></poll-meter>
					<small>${result.votes} ${result.votes === 1 ? "vote" : "votes"}</small>
				</li>`,
		)}
	</ol>`;
results.id = "poll-results";

/** The page's body: the question, the ballot, and the results, kept current by `live`. */
export const pollPage = (props: {
	readonly question: string;
	readonly vote: string;
	readonly live: string;
	readonly results: readonly Result[];
}) =>
	html`<main data-signals="${signals}" data-init="@get('${props.live}')">
		<h1>${props.question}</h1>
		${ballot({ vote: props.vote })}
		<p data-show="$poll.voted !== ''">Thanks for voting.</p>
		${results({ results: props.results })}
	</main>`;
