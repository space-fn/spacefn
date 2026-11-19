import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { packageDir, run } from "./process.ts";

export type AlchemyCommand = "dev" | "deploy" | "destroy";

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
	return existsSync(join(root, file)) ? join("..", file) : undefined;
};

export const stageFor = (command: AlchemyCommand, options: AlchemyOptions): string | undefined =>
	options.stage ?? (command === "dev" ? undefined : "prod");

/** The arguments for Alchemy's CLI, run with cwd `.space/` so its state stays there. */
export const alchemyArgs = (
	root: string,
	command: AlchemyCommand,
	options: AlchemyOptions = {},
) => {
	const stage = stageFor(command, options);
	const envFile = envFileFor(root, command, stage ?? "dev");
	return [
		command,
		"alchemy.run.ts",
		...(stage ? ["--stage", stage] : []),
		...(envFile ? ["--env-file", envFile] : []),
		...(options.yes && command !== "dev" ? ["--yes", "--no-input"] : []),
	];
};

/** Alchemy's CLI script, resolved from this package (the app needn't install Alchemy itself). */
export const alchemyCli = (): string => {
	const dir = packageDir(fileURLToPath(new URL(".", import.meta.url)), "alchemy");
	if (!dir) throw new Error("Alchemy isn't installed. Reinstall @spacefn/infra.");
	return join(dir, "bin", "cli.js");
};

/** Runs Alchemy for the app at `root` and returns its exit code. */
export const runAlchemy = (root: string, command: AlchemyCommand, options: AlchemyOptions = {}) =>
	run(process.execPath, [alchemyCli(), ...alchemyArgs(root, command, options)], {
		cwd: join(root, ".space"),
		// `alchemy dev` doesn't always exit on SIGTERM.
		killAfterMs: 5_000,
	});
