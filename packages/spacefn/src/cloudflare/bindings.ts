import { ConfigProvider, Context } from "effect";

/** The Worker's `env`: vars and secrets are strings, everything else is a binding. */
export type WorkerEnv = Readonly<Record<string, unknown>>;

/**
 * Config from the Worker's vars and secrets, so `defineEnv`, `libsqlFromConfig`
 * and `telemetry` read them like process env on Bun. Bindings are left out.
 */
export const configProvider = (env: WorkerEnv): ConfigProvider.ConfigProvider =>
	ConfigProvider.fromUnknown(
		Object.fromEntries(Object.entries(env).filter(([, value]) => typeof value === "string")),
	);

/** The binding `name`, or a defect that says which binding the Worker lacks. */
export const binding = <T>(env: WorkerEnv, name: string, what: string): T => {
	const value = env[name];
	if (value === undefined || value === null || typeof value !== "object")
		throw new Error(
			`The Worker has no ${what} binding named ${name}. Run space gen and redeploy, or add it in configs/infra.ts.`,
		);
	return value as T;
};

/**
 * The Worker's `env`, for Cloudflare-only code that needs a binding spacefn
 * doesn't wrap, such as the app's own Durable Objects or workflows:
 * `const { ROOM } = yield* CloudflareEnv`.
 */
export class CloudflareEnv extends Context.Service<CloudflareEnv, WorkerEnv>()(
	"spacefn/cloudflare/CloudflareEnv",
) {}
