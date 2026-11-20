import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { spacefnDir } from "./process.ts";

/** The Dockerfile used when the app has no `configs/docker/Dockerfile`. */
export const DEFAULT_DOCKERFILE = join(spacefnDir(), "docker", "Dockerfile");

/** Where an app keeps its own Dockerfile, relative to the app root. */
export const APP_DOCKERFILE = "configs/docker/Dockerfile";

/** The app's Dockerfile: `configs/docker/Dockerfile` if there is one, else spacefn's. */
export const dockerfileFor = (root: string): string => {
	const own = join(root, APP_DOCKERFILE);
	return existsSync(own) ? own : DEFAULT_DOCKERFILE;
};

/**
 * `space add docker`: copies spacefn's Dockerfile to `configs/docker/Dockerfile`
 * so the app can change it. Refuses to overwrite one that is there.
 */
export const addDockerfile = async (root: string): Promise<"written" | "exists"> => {
	const target = join(root, APP_DOCKERFILE);
	if (existsSync(target)) return "exists";
	await mkdir(join(root, "configs", "docker"), { recursive: true });
	await copyFile(DEFAULT_DOCKERFILE, target);
	return "written";
};
