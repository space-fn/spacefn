import { join } from "node:path";

import { Effect } from "effect";
import { createBuilder } from "vite";

/**
 * `space build`: `vite build` with `configs/vite.ts`, into `dist/`. On Bun
 * that's the client and the server bundle, run with `bun dist/server/index.js`.
 */
export const build = (root: string): Effect.Effect<void, unknown> =>
	Effect.tryPromise({
		try: async () => {
			const builder = await createBuilder({ configFile: join(root, "configs", "vite.ts"), root });
			await builder.buildApp();
		},
		catch: (error) => error,
	});
