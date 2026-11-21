import { Effect } from "effect";

import type { Target } from "../app-config.ts";
import type { SpaceError } from "../errors.ts";
import { loadAppConfig } from "./load-app-config.ts";
import { planApp, type AppPlan } from "./plan.ts";
import { renderApp } from "./render.ts";
import type { Mode } from "./route-path.ts";
import { scanApp } from "./scan-app.ts";
import { writeGenerated, type WriteResult } from "./write.ts";

/** Reads `package.json` and `app/` and checks them: everything codegen and the CLI work from. */
export const loadPlan = Effect.fnUntraced(function* (
	root: string,
	mode: Mode,
	target: Target,
): Effect.fn.Return<AppPlan, SpaceError> {
	const config = yield* loadAppConfig(root, target);
	const tree = yield* scanApp(root);
	return yield* planApp(tree, config, mode);
});

/** {@link gen}, also giving the plan it wrote from. */
export const genPlan = Effect.fnUntraced(function* (
	root: string,
	mode: Mode,
	target: Target,
): Effect.fn.Return<{ readonly plan: AppPlan; readonly result: WriteResult }, SpaceError> {
	const plan = yield* loadPlan(root, mode, target);
	return { plan, result: yield* writeGenerated(root, renderApp(plan)) };
});

/** `space gen`: read `app/`, check it, and write `.space/`. */
export const gen = (root: string, mode: Mode, target: Target) =>
	Effect.map(genPlan(root, mode, target), ({ result }) => result);
