import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { packageDir, run } from "./process.ts";

export type AlchemyCommand = "dev" | "deploy" | "destroy";

/** The app's Alchemy stack, from the app root. */
export const INFRA_FILE = "configs/infra.ts";

export interface AlchemyOptions {
	/** Default: Alchemy's own (`$ALCHEMY_STAGE`, else `dev_$USER`) for dev, `prod` otherwise. */
	readonly stage?: string | undefined;
	/** Approve without a prompt, for CI. */
	readonly yes?: boolean;
}

/**
 * The env file a command loads, from the app root: `.env` for dev; for a
 * deploy or destroy `.env.<stage>` if there is one, never `.env`, so local
 * values don't reach production. CI usually sets variables in the environment.
 */
export const envFileFor = (
	root: string,
	command: AlchemyCommand,
	stage: string,
): string | undefined => {
	const file = command === "dev" ? ".env" : `.env.${stage}`;
	return existsSync(join(root, file)) ? file : undefined;
};

export const stageFor = (command: AlchemyCommand, options: AlchemyOptions): string | undefined =>
	options.stage ?? (command === "dev" ? undefined : "prod");

/** The arguments for Alchemy's CLI on the app's stack, `configs/infra.ts`, run from the app root. */
export const alchemyArgs = (
	root: string,
	command: AlchemyCommand,
	options: AlchemyOptions = {},
) => {
	const stage = stageFor(command, options);
	const envFile = envFileFor(root, command, stage ?? "dev");
	return [
		command,
		INFRA_FILE,
		...(stage ? ["--stage", stage] : []),
		...(envFile ? ["--env-file", envFile] : []),
		...(options.yes && command !== "dev" ? ["--yes", "--no-input"] : []),
	];
};

/**
 * Alchemy's CLI script: the app's own Alchemy, which `configs/infra.ts`
 * imports, else the one spacefn came with.
 */
export const alchemyCli = (root: string): string => {
	const dir =
		packageDir(root, "alchemy") ??
		packageDir(fileURLToPath(new URL(".", import.meta.url)), "alchemy");
	if (!dir) throw new Error("Alchemy isn't installed: add alchemy to the app's devDependencies.");
	return join(dir, "bin", "cli.js");
};

/** Runs Alchemy for the app at `root` and returns its exit code. */
export const runAlchemy = (root: string, command: AlchemyCommand, options: AlchemyOptions = {}) =>
	run(process.execPath, [alchemyCli(root), ...alchemyArgs(root, command, options)], {
		cwd: root,
		// `alchemy dev` doesn't always exit on SIGTERM.
		killAfterMs: 5_000,
	});
