import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import * as Docker from "@alchemy.run/docker";
import * as Alchemy from "alchemy";
import { Effect } from "effect";

import type { InfraConfig } from "./infra-config.ts";
import { deployVariables } from "./variables.ts";

/** What codegen knows about the app, as `.space/alchemy.run.ts` passes it. */
export interface DockerApp {
	readonly name: string;
	/** `.space/`; the image is built from `.space/dist`. */
	readonly rootDir: string;
	readonly db: readonly { readonly driver: string; readonly binding: string }[];
	readonly folders: readonly string[];
}

export interface DockerStackOptions {
	readonly env?: { readonly fields: Readonly<Record<string, unknown>> } | undefined;
	readonly infra?: InfraConfig | undefined;
}

/** The Dockerfile used when the app has no `configs/docker/Dockerfile`. */
export const DEFAULT_DOCKERFILE = fileURLToPath(new URL("../docker/Dockerfile", import.meta.url));

/** The app's Dockerfile: `configs/docker/Dockerfile` if there is one, else spacefn's. */
export const dockerfileFor = (rootDir: string): string => {
	const own = join(rootDir, "..", "configs", "docker", "Dockerfile");
	return existsSync(own) ? own : DEFAULT_DOCKERFILE;
};

/**
 * The Alchemy stack for a Bun app: an image built from `.space/dist` (so run
 * `space build` first), a volume for `/data` (file databases, the state
 * database, blobs) and one container, restarted unless stopped. With
 * `docker.host` in `configs/infra.ts` it all happens on that Docker host.
 */
export const dockerStack = (app: DockerApp, options: DockerStackOptions = {}) =>
	Alchemy.Stack(
		app.name,
		{ providers: Docker.providers(), state: Alchemy.localState() },
		Effect.gen(function* () {
			const infra = options.infra?.docker ?? {};
			const dist = join(app.rootDir, "dist");
			if (!existsSync(join(dist, "server", "index.js")))
				return yield* Effect.die(new Error("No build in .space/dist. Run space build first."));
			const context = infra.host
				? { context: yield* Docker.Context("Host", { docker: `host=${infra.host}` }) }
				: {};
			const image = yield* Docker.Image("Image", {
				name: app.name,
				skipPush: true,
				build: {
					context: dist,
					dockerfile: dockerfileFor(app.rootDir),
					...(infra.platform ? { platform: infra.platform } : {}),
				},
				...context,
			});
			const data = yield* Docker.Volume("Data", { ...context });
			const port = infra.port ?? 3000;
			yield* Docker.Container("App", {
				image,
				start: true,
				restart: "unless-stopped",
				ports: [{ external: port, internal: 3000 }],
				volumes: [{ hostPath: data.name, containerPath: "/data" }],
				environment: {
					...deployVariables({
						env: options.env,
						libsql: app.db.filter((db) => db.driver === "libsql").map((db) => db.binding),
					}),
					...infra.env,
				},
				// SIGTERM lets requests finish and hands queue messages back.
				stopTimeout: "30 seconds",
				...context,
			});
			const host = infra.host
				? new URL(infra.host.replace(/^ssh:/, "http:")).hostname
				: "localhost";
			return { url: `http://${host}:${port}` };
		}),
	);
