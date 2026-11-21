import { Effect } from "effect";
import { page } from "spacefn";

import { layout } from "#lib/ui/layout.ts";
import { aboutPage } from "#modules/cart/views.ts";

export default page({
	loader: Effect.void,
	render: () => layout("About", aboutPage()),
});
