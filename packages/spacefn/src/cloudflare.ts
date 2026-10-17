import type { CloudflareConfig, WorkerConfig } from "cf/config";

export type SpaceWorkerConfig = Omit<WorkerConfig, "entrypoint"> & {
	/** Defaults to the generated `.space/worker.ts`. */
	entrypoint?: WorkerConfig["entrypoint"];
};

export const DEFAULT_ENTRYPOINT = "./.space/worker.ts";

/** Builds the default export of `cloudflare.config.ts` for a spacefn app. */
export function defineSpace(worker: SpaceWorkerConfig): CloudflareConfig {
	return { worker: { entrypoint: DEFAULT_ENTRYPOINT, ...worker } };
}
