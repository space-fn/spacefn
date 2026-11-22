import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";

import { Duration, Effect, Queue, type Result, Stream } from "effect";

import type { Target } from "../app-config.ts";
import type { SpaceError } from "../errors.ts";
import { gen } from "./gen.ts";
import { loadAppConfig } from "./load-app-config.ts";
import type { Mode } from "./route-path.ts";
import type { WriteResult } from "./write.ts";

/** Root entries whose changes can change the generated files. */
const WATCHED_AT_ROOT = new Set(["app", "configs", ".gitignore", "package.json"]);

/**
 * Emits once when the watchers are armed, then for each change under `app/`,
 * `configs/` and the code folders (which hold islands) and to root files that
 * affect codegen. The folders are watched recursively; creating one later
 * re-arms its watcher.
 */
const changes = (root: string, folders: readonly string[]): Stream.Stream<void> =>
	Stream.callback<void>((queue) =>
		Effect.acquireRelease(
			Effect.sync(() => {
				const watchers = new Map<string, FSWatcher>();
				const watched = ["app", "configs", ...folders];
				const notify = () => Queue.offerUnsafe(queue, undefined);
				const arm = (folder: string) => {
					watchers.get(folder)?.close();
					try {
						watchers.set(folder, watch(join(root, folder), { recursive: true }, notify));
					} catch {
						watchers.delete(folder); // not created yet; the root watcher re-arms it
					}
				};
				watchers.set(
					".",
					watch(root, (_event, name) => {
						const inside = watched.filter((folder) => folder.split("/")[0] === name);
						if (!name || (!WATCHED_AT_ROOT.has(name) && inside.length === 0)) return;
						for (const folder of inside) arm(folder);
						notify();
					}),
				);
				for (const folder of watched) arm(folder);
				// The first run starts only now, so a save during it is not missed.
				notify();
				return watchers;
			}),
			(watchers) => Effect.sync(() => watchers.forEach((watcher) => watcher.close())),
		),
	);

/**
 * `space gen --watch`: runs {@link gen} once, then again after each burst of
 * changes (debounced). Failures are emitted, not raised, so a typo in a route
 * file shows an error and the next save recovers.
 */
export const watchGen = (
	root: string,
	mode: Mode,
	target: Target,
	debounce: Duration.Input = Duration.millis(50),
): Stream.Stream<Result.Result<WriteResult, SpaceError>> =>
	Stream.unwrap(
		// The code folders as package.json has them when the watch starts.
		loadAppConfig(root, target).pipe(
			Effect.map((config) => config.folders),
			Effect.orElseSucceed(() => []),
			Effect.map((folders) => changes(root, folders)),
		),
	).pipe(
		Stream.debounce(debounce),
		Stream.mapEffect(() => Effect.result(gen(root, mode, target))),
	);
