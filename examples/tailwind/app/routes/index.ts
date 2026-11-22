import { Effect } from "effect";
import { action, Datastar, page } from "spacefn";

import { layout } from "#lib/ui/layout.ts";
import * as Team from "#modules/team/team.ts";
import { memberList, teamPage } from "#modules/team/views.ts";

// The team page at /. It only connects the team module to the web.

export default page({
	loader: Effect.all({ title: Team.title, members: Team.members }),
	actions: {
		// The search box: a Datastar @get with the signals, answered with the list to swap in.
		search: action({
			method: "get",
			input: Team.Search,
			handler: ({ team }) =>
				Datastar.sse([Datastar.patchElements(memberList({ members: Team.search(team.query) }))]),
		}),
	},
	render: (ctx) =>
		layout(
			ctx.data.title,
			teamPage({
				title: ctx.data.title,
				search: ctx.actions.search.url,
				members: ctx.data.members,
			}),
		),
});
