import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { scanRoutes } from "../src/vite/generator.js";

describe("scanRoutes", () => {
	it("maps dynamic and catch-all filenames to route patterns", async () => {
		const root = await mkdtemp(join(tmpdir(), "space-routes-"));
		try {
			await mkdir(join(root, "src/routes/users"), { recursive: true });
			await mkdir(join(root, "src/routes/files"), { recursive: true });
			await writeFile(
				join(root, "src/routes/files/[...path].get.ts"),
				"export default () => new Response();",
			);
			await writeFile(
				join(root, "src/routes/users/[id].ts"),
				"export default () => new Response();",
			);

			const routes = await scanRoutes(root);

			expect(routes.map(({ pattern, method }) => ({ pattern, method }))).toEqual([
				{ pattern: "/files/*path", method: "GET" },
				{ pattern: "/users/:id", method: "*" },
			]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
