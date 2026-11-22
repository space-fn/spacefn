import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Duration, Effect, Queue, Result, Stream } from "effect";

import { watchGen } from "../src/codegen/watch.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "spacefn-watch-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

const write = (files: Record<string, string>) =>
	Effect.promise(async () => {
		for (const [file, body] of Object.entries(files)) {
			await mkdir(dirname(join(root, file)), { recursive: true });
			await writeFile(join(root, file), body);
		}
	});

describe("watchGen", () => {
	it.live(
		"regenerates after changes and keeps going after a failure",
		() =>
			Effect.scoped(
				Effect.gen(function* () {
					yield* write({
						"package.json": JSON.stringify({ name: "todo" }),
						".gitignore": ".space/\n",
						"app/entry.ts": "",
						"app/routes/index.ts": "",
					});
					const results =
						yield* Queue.unbounded<
							Result.Result<{ written: readonly string[] }, { code: string }>
						>();
					yield* watchGen(root, "dev", "bun", Duration.millis(30)).pipe(
						Stream.runForEach((result) => Queue.offer(results, result)),
						Effect.forkScoped,
					);
					type Got = Result.Result<{ written: readonly string[] }, { code: string }>;
					// Under load one change can arrive as several debounced batches, so wait for
					// the result a step expects and skip extra "up to date" runs.
					const until = (wanted: (result: Got) => boolean) =>
						Effect.gen(function* () {
							while (true) {
								const result = yield* Queue.take(results);
								if (wanted(result)) return result;
							}
						}).pipe(Effect.timeout(Duration.seconds(10)));
					const wrote = (file: string) => (r: Got) =>
						Result.isSuccess(r) && r.success.written.includes(file);

					yield* until(wrote("manifest.ts"));

					yield* write({ "app/routes/about.ts": "" });
					const added = yield* until((r) => Result.isFailure(r) || r.success.written.length > 0);
					expect(Result.isSuccess(added) && added.success.written).toEqual(["manifest.ts"]);

					yield* write({ "app/durable-objects/room.ts": "" });
					const failed = yield* until(Result.isFailure);
					expect(Result.isFailure(failed) && failed.failure.code).toBe("TARGET_UNSUPPORTED");

					yield* Effect.promise(() => rm(join(root, "app/durable-objects"), { recursive: true }));
					expect(Result.isSuccess(yield* until(Result.isSuccess))).toBe(true);
				}),
			),
		30_000,
	);
});
