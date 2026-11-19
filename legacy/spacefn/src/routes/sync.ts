import { join } from "node:path";

import type { PageFile } from "../pages/scan";
import { writeIfChanged } from "../write";
import { generateRoutesSource } from "./generate";
import { scanRoutes, type Mode } from "./scan";

/** Scans route and page files and writes the unified `<root>/.space/routes.ts`. */
export async function syncRoutes(
	root: string,
	mode: Mode,
	pages: PageFile[] = [],
): Promise<boolean> {
	const app = join(root, "app");
	const routes = await scanRoutes(join(app, "routes"), mode);
	return writeIfChanged(join(root, ".space", "routes.ts"), generateRoutesSource(routes, pages));
}
