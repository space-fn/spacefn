import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ConfigProvider, Context, Effect, Layer } from "effect";

import { SpaceState } from "../src/state.ts";

export const dir = await mkdtemp(join(tmpdir(), "spacefn-bun-"));
process.on("exit", () => void rm(dir, { recursive: true, force: true }));

/** A state database file, as each process would open it. */
export const stateAt = (file: string) =>
	SpaceState.layer.pipe(
		Layer.provide(
			ConfigProvider.layer(
				ConfigProvider.fromUnknown({ SPACE_STATE_URL: `file:${join(dir, file)}` }),
			),
		),
	);

/** A service of `layer`, kept alive (pollers and all) until the test's scope closes. */
export const build = <I, S>(tag: Context.Key<I, S>, layer: Layer.Layer<I, unknown>) =>
	Layer.build(layer).pipe(Effect.map(Context.get(tag)));
