import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";

import { Duration, Effect, Queue, type Result, Stream } from "effect";

import type { SpaceError } from "../errors.ts";
import { gen } from "./gen.ts";
import type { Mode } from "./route-path.ts";
import type { WriteResult } from "./write.ts";

/** Root entries whose changes can change the generated files. */
const WATCHED_AT_ROOT = new Set(["app", "configs", ".gitignore", "package.json"]);

/**
 * Emits once per batch of file changes under `app/` and `configs/`, and for
 * root files that affect codegen. `app/` and `configs/` are watched
 * recursively; creating them later re-arms their watchers.
 */
const changes = (root: string): Stream.Stream<void> =>
	Stream.callback<void>((queue) =>
		Effect.acquireRelease(
			Effect.sync(() => {
				const watchers = new Map<string, FSWatcher>();
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
						if (!name || !WATCHED_AT_ROOT.has(name)) return;
						if (name === "app" || name === "configs") arm(name);
						notify();
					}),
				);
				arm("app");
				arm("configs");
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
	debounce: Duration.Input = Duration.millis(50),
): Stream.Stream<Result.Result<WriteResult, SpaceError>> =>
	Stream.concat(Stream.make(undefined), changes(root).pipe(Stream.debounce(debounce))).pipe(
		Stream.mapEffect(() => Effect.result(gen(root, mode))),
	);
