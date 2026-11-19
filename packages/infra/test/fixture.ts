import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import { gen } from "spacefn/codegen";

const infra = fileURLToPath(new URL("..", import.meta.url));

/**
 * A fixture app under `test/fixtures/`, generated, with `@spacefn/infra`
 * linked into its node_modules: Vite's config loader doesn't resolve a
 * package's import of itself.
 */
export const fixtureApp = async (name: string) => {
	const root = join(infra, "test", "fixtures", name);
	await rm(join(root, ".space"), { recursive: true, force: true });
	await mkdir(join(root, "node_modules", "@spacefn"), { recursive: true });
	await rm(join(root, "node_modules", "@spacefn", "infra"), { force: true });
	await symlink(infra, join(root, "node_modules", "@spacefn", "infra"));
	await Effect.runPromise(gen(root, "dev"));
	const data = await mkdtemp(join(tmpdir(), `space-${name}-`));
	return {
		root,
		data,
		cleanup: () => rm(data, { recursive: true, force: true }),
	};
};
