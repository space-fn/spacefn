import type { Effect } from "effect";

export interface CloudflareInfra {
	/**
	 * Bindings spacefn doesn't create, keyed by binding name: Workers AI,
	 * Hyperdrive, another Worker... Read them with `CloudflareEnv`.
	 *
	 * ```ts
	 * bindings: Effect.gen(function* () {
	 *   return { AI: yield* Cloudflare.Ai("AI") };
	 * }),
	 * ```
	 */
	readonly bindings?: Effect.Effect<Readonly<Record<string, unknown>>, never, any>;
	/** Worker settings spacefn leaves alone: `domain`, `routes`, `observability`, `limits`, ... */
	readonly worker?: Readonly<Record<string, unknown>>;
}

export interface DockerInfra {
	/** Where to run the container: a Docker host such as `ssh://deploy@example.com`. Default: local Docker. */
	readonly host?: string;
	/** The host port the app listens on. Default 3000. */
	readonly port?: number;
	/** Image platform, e.g. `linux/amd64`. The image is built on the Docker host, so only set it to build for another. */
	readonly platform?: string;
	/** Extra environment for the container, beside the app's env variables. */
	readonly env?: Readonly<Record<string, string>>;
}

/** The shape of `configs/infra.ts`: what spacefn's generated infra can't guess. */
export interface InfraConfig {
	readonly cloudflare?: CloudflareInfra;
	readonly docker?: DockerInfra;
}

/**
 * Declares `configs/infra.ts`, merged into the generated `.space/alchemy.run.ts`.
 *
 * ```ts
 * export default defineInfra({ cloudflare: { worker: { domain: "todo.example.com" } } });
 * ```
 */
export const defineInfra = (config: InfraConfig): InfraConfig => config;
