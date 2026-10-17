import { join } from "node:path";

import { writeIfChanged } from "../write";
import { generateRoutesSource } from "./generate";
import { scanRoutes, type Mode } from "./scan";

/** Scans `<root>/routes` and writes `<root>/.space/routes.ts`. */
export async function syncRoutes(root: string, mode: Mode): Promise<boolean> {
	const routes = await scanRoutes(join(root, "routes"), mode);
	return writeIfChanged(join(root, ".space", "routes.ts"), generateRoutesSource(routes));
}
