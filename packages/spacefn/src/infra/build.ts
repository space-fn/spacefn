import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Effect } from "effect";
import { createBuilder } from "vite";

import { run } from "./process.ts";

/**
 * `space build` on Bun: the client, then the server bundle, into
 * `.space/dist`, then its native packages installed beside the bundle so
 * `bun .space/dist/server/index.js` runs as is. The Docker image installs its
 * own for its platform, so they're kept out of it. Run `space gen --prod` first.
 * Cloudflare builds during `space deploy`.
 */
export const buildBun = (root: string): Effect.Effect<void, unknown> =>
	Effect.gen(function* () {
		yield* Effect.tryPromise({
			try: async () => {
				const builder = await createBuilder({ configFile: join(root, ".space", "vite.config.ts") });
				await builder.buildApp();
				await writeFile(join(root, ".space", "dist", ".dockerignore"), "server/node_modules\n");
			},
			catch: (error) => error,
		});
		const server = join(root, ".space", "dist", "server");
		const code = yield* run("bun", ["install", "--production", "--silent"], { cwd: server });
		if (code !== 0)
			return yield* Effect.fail(new Error("bun install in .space/dist/server failed"));
	});
