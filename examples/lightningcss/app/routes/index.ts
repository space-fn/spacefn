import { Effect } from "effect";
import { page } from "spacefn";

import { layout } from "#lib/ui/layout.ts";
import * as Releases from "#modules/releases/releases.ts";
import { releasesPage } from "#modules/releases/views.ts";

// The release notes at /.
export default page({
	loader: Effect.all({ releases: Releases.list }),
	render: (ctx) => layout("Release notes", releasesPage(ctx.data)),
});
