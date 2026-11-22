import { Effect, Schema } from "effect";
import { action, Datastar, page } from "spacefn";

import { layout } from "#lib/ui/layout.ts";
import * as Poll from "#modules/poll/poll.ts";
import { pollPage, results } from "#modules/poll/views.ts";

// The poll at /. It only connects the poll module to the web.

export default page({
	loader: Effect.all({ question: Poll.question, results: Poll.results }),
	actions: {
		// A Datastar @post: it answers with signals to patch, not a page.
		vote: action({
			input: Poll.Vote,
			handler: ({ poll }) =>
				Effect.andThen(
					Poll.vote(poll.choice),
					Datastar.sse([Datastar.patchSignals({ poll: { voted: poll.choice } })]),
				),
		}),
		// Datastar opens this when the page loads, and gets the results again after each vote.
		live: action({
			method: "get",
			input: Schema.Struct({}),
			handler: () =>
				Datastar.watch(
					[Poll.TOPIC],
					Effect.map(Poll.results, (all) => results({ results: all })),
				),
		}),
	},
	render: (ctx) =>
		layout(
			ctx.data.question,
			pollPage({
				question: ctx.data.question,
				vote: ctx.actions.vote.url,
				live: ctx.actions.live.url,
				results: ctx.data.results,
			}),
		),
});
