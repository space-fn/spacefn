import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

import { addDockerfile, DEFAULT_DOCKERFILE, dockerfileFor } from "../../src/infra/dockerfile.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "space-add-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

it("copies the Dockerfile into configs/ once, and the stack uses it from then on", async () => {
	expect(dockerfileFor(root)).toBe(DEFAULT_DOCKERFILE);
	expect(await addDockerfile(root)).toBe("written");
	const own = join(root, "configs/docker/Dockerfile");
	expect(await readFile(own, "utf8")).toBe(await readFile(DEFAULT_DOCKERFILE, "utf8"));
	expect(dockerfileFor(root)).toBe(own);
	expect(await addDockerfile(root)).toBe("exists");
});
