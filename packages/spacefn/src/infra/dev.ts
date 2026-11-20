import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run, spacefnDir } from "./process.ts";

/** The dev-bun script: the source in the workspace, the built file when published. */
const devBunScript = () =>
	extname(fileURLToPath(import.meta.url)) === ".ts"
		? join(spacefnDir(), "src", "infra", "dev-bun.ts")
		: join(spacefnDir(), "dist", "infra", "dev-bun.mjs");

/** `space dev` on Bun: Vite inside Bun, so route code runs on Bun as in production. */
export const devBun = (root: string, port: number | undefined) =>
	run("bun", [devBunScript(), root, ...(port === undefined ? [] : [String(port)])], {
		cwd: root,
	});
