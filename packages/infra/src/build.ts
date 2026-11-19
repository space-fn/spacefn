import { join } from "node:path";

import { createBuilder } from "vite";

/**
 * `space build` on Bun: the client, then the server bundle, into `.space/dist`.
 * Run `space gen --prod` first. Cloudflare builds during `space deploy`.
 */
export const buildBun = async (root: string): Promise<void> => {
	const builder = await createBuilder({ configFile: join(root, ".space", "vite.config.ts") });
	await builder.buildApp();
};
