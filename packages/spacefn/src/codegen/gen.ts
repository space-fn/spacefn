import { Effect } from "effect";

import type { SpaceError } from "../errors.ts";
import { loadSpaceConfig } from "./load-space-config.ts";
import { planApp } from "./plan.ts";
import { renderApp } from "./render.ts";
import type { Mode } from "./route-path.ts";
import { scanApp } from "./scan-app.ts";
import { writeGenerated, type WriteResult } from "./write.ts";

/** `space gen`: read the config and `app/`, check them, and write `.space/`. */
export const gen = Effect.fnUntraced(function* (
	root: string,
	mode: Mode,
): Effect.fn.Return<WriteResult, SpaceError> {
	const config = yield* loadSpaceConfig(root);
	const tree = yield* scanApp(root);
	const plan = yield* planApp(tree, config, mode);
	return yield* writeGenerated(root, renderApp(plan));
});
