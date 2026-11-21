import { Effect } from "effect";
import { html, page } from "spacefn";

import { layout } from "#lib/ui/layout.ts";
import { RELEASES } from "#modules/releases/releases.ts";
import { releaseList } from "#modules/releases/views.ts";

// The release notes at /.
export default page({
	loader: Effect.succeed({ releases: RELEASES }),
	render: (ctx) =>
		layout(
			"Release notes",
			html`<h1>Release notes</h1>
				${releaseList(ctx.data)}`,
		),
});
