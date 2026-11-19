import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run } from "./process.ts";

/** The dev-bun script next to this file: `.ts` in the workspace, `.mjs` when published. */
const devBunScript = () => {
	const self = fileURLToPath(import.meta.url);
	return join(self, "..", `dev-bun${extname(self)}`);
};

/** `space dev` on Bun: Vite inside Bun, so route code runs on Bun as in production. */
export const devBun = (root: string, port: number | undefined) =>
	run("bun", [devBunScript(), root, ...(port === undefined ? [] : [String(port)])], {
		cwd: root,
	});
