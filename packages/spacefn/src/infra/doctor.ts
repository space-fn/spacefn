import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

import { type Config, ConfigProvider, Effect } from "effect";
import { formatSpaceError, SpaceError } from "spacefn";
import { loadPlan, renderApp, type AppPlan } from "spacefn/codegen";

import { addCommand, detectPackageManager } from "./package-manager.ts";
import { packageDir } from "./process.ts";
import { loadTarget } from "./vite-config.ts";

export interface Check {
	readonly level: "ok" | "warn" | "fail";
	readonly message: string;
}

const ok = (message: string): Check => ({ level: "ok", message });
const warn = (message: string): Check => ({ level: "warn", message });
const fail = (message: string): Check => ({ level: "fail", message });

const MIN_NODE = 22;

const checkNode = (): Check => {
	const major = Number(process.versions.node.split(".")[0]);
	return major >= MIN_NODE
		? ok(`Node ${process.versions.node}`)
		: fail(`Node ${process.versions.node} is too old: spacefn needs ${MIN_NODE} or later`);
};

/** Whether `.space/` holds what `space gen` would write now. */
const checkGenerated = async (root: string, plan: AppPlan): Promise<Check> => {
	for (const [file, content] of Object.entries(renderApp(plan))) {
		const current = await readFile(join(root, ".space", file), "utf8").catch(() => undefined);
		if (current !== content)
			return warn(".space/ is out of date: run space gen (space dev does it too)");
	}
	return ok(".space/ is up to date");
};

const checkProvider = (root: string, plan: AppPlan): Check => {
	const provider = plan.target === "cloudflare" ? "@alchemy.run/cloudflare" : "@alchemy.run/docker";
	if (packageDir(root, provider)) return ok(`${provider} is installed`);
	const install = addCommand(detectPackageManager(root), [provider], true).join(" ");
	return fail(`${provider} isn't installed; dev and deploy need it: ${install}`);
};

const has = (command: string, args: string[]) => spawnSync(command, args).status === 0;

const checkTools = (plan: AppPlan): Check[] =>
	plan.target === "bun"
		? [
				has("bun", ["--version"])
					? ok("Bun is installed")
					: fail("Bun isn't installed; the Bun target runs on it: https://bun.sh"),
				has("docker", ["info"])
					? ok("Docker is running")
					: warn(
							"Docker isn't running; space deploy needs it (or docker.host in configs/infra.ts)",
						),
			]
		: [];

/**
 * Whether the app's env reads from `.env` and the environment as dev would.
 * `configs/env.ts` is imported, as a deploy imports it.
 */
const checkEnv = async (root: string, plan: AppPlan): Promise<Check> => {
	if (!plan.env) return ok("No configs/env.ts");
	const file = join(root, ".env");
	const local = existsSync(file) ? parseEnv(await readFile(file, "utf8")) : {};
	try {
		const env = (await import(pathToFileURL(join(root, "configs", "env.ts")).href)) as {
			default: { config: Config.Config<unknown> };
		};
		const provider = ConfigProvider.fromUnknown({ ...process.env, ...local });
		await Effect.runPromise(
			Effect.gen(function* () {
				yield* env.default.config;
			}).pipe(Effect.provide(ConfigProvider.layer(provider))),
		);
		return ok("configs/env.ts reads from .env and the environment");
	} catch (error) {
		const detail = String(error instanceof Error ? error.message || error : error)
			.replace(/^ConfigError\((SchemaError\()?|\)+$/g, "")
			.replace(/\s+/g, " ");
		return warn(
			`configs/env.ts doesn't read in dev (set it in .env or give it a default): ${detail}`,
		);
	}
};

/** `space doctor`: everything dev and deploy need, checked. */
export const doctor = async (root: string): Promise<readonly Check[]> => {
	const checks: Check[] = [checkNode()];
	let plan: AppPlan;
	try {
		plan = await Effect.runPromise(
			Effect.flatMap(loadTarget(root), (target) => loadPlan(root, "dev", target)),
		);
	} catch (error) {
		const cause = (error as { cause?: unknown }).cause ?? error;
		checks.push(fail(cause instanceof SpaceError ? formatSpaceError(cause) : String(cause)));
		return checks;
	}
	checks.push(ok(`configs/vite.ts and app/ check out (target ${plan.target})`));
	checks.push(await checkGenerated(root, plan));
	checks.push(checkProvider(root, plan));
	checks.push(...checkTools(plan));
	checks.push(await checkEnv(root, plan));
	return checks;
};

const MARK = { ok: "✓", warn: "!", fail: "✗" } as const;

export const formatChecks = (checks: readonly Check[]): string =>
	["space doctor", ...checks.map((check) => `  ${MARK[check.level]} ${check.message}`)].join("\n");
