import { Effect } from "effect";

import type { SpaceError } from "../errors.ts";
import { loadSpaceConfig } from "./load-space-config.ts";
import { planApp, type AppPlan } from "./plan.ts";
import { renderApp } from "./render.ts";
import type { Mode } from "./route-path.ts";
import { scanApp } from "./scan-app.ts";
import { writeGenerated, type WriteResult } from "./write.ts";

/** Reads the config and `app/` and checks them: everything codegen and the CLI work from. */
export const loadPlan = Effect.fnUntraced(function* (
	root: string,
	mode: Mode,
): Effect.fn.Return<AppPlan, SpaceError> {
	const config = yield* loadSpaceConfig(root);
	const tree = yield* scanApp(root, Object.values(config.aliases));
	return yield* planApp(tree, config, mode);
});

/** `space gen`: read the config and `app/`, check them, and write `.space/`. */
export const gen = Effect.fnUntraced(function* (
	root: string,
	mode: Mode,
): Effect.fn.Return<WriteResult, SpaceError> {
	return yield* writeGenerated(root, renderApp(yield* loadPlan(root, mode)));
});
