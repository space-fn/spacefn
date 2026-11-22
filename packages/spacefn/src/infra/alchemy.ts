import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import { SpaceError } from "spacefn";

import { packageDir, run } from "./process.ts";

export type AlchemyCommand = "dev" | "deploy" | "destroy";

/** The app's Alchemy stack, from the app root. */
export const INFRA_FILE = "configs/infra.ts";

/** How `space dev --port` reaches `configs/infra.ts`, where the Worker's port is set. */
export const DEV_PORT = "SPACE_DEV_PORT";

export interface AlchemyOptions {
	/** Default: Alchemy's own (`$ALCHEMY_STAGE`, else `dev_$USER`) for dev, `prod` otherwise. */
	readonly stage?: string | undefined;
	/** Approve without a prompt, for CI. */
	readonly yes?: boolean;
	/** The dev server's port, for `configs/infra.ts` to read. */
	readonly port?: number | undefined;
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

/** Why `localhost:port` can't be listened on, if it can't. */
const listenError = (port: number) =>
	new Promise<string | undefined>((done) => {
		const server = createServer();
		server.once("error", (error: NodeJS.ErrnoException) =>
			done(error.code === "EADDRINUSE" ? "it's in use" : error.message),
		);
		server.listen(port, "localhost", () => server.close(() => done(undefined)));
	});

/**
 * Fails when `space dev --port` can't be honored. Checked before Alchemy runs,
 * which keeps running with nothing served when it can't have the port.
 */
export const checkDevPort = Effect.fn(function* (root: string, port: number | undefined) {
	if (port === undefined) return;
	if (port < 0 || port > 65_535)
		return yield* new SpaceError({
			code: "DEV_PORT_INVALID",
			message: `--port ${port} isn't a port: it's 0 to 65535`,
		});
	const file = join(root, INFRA_FILE);
	// No stack at all is Alchemy's error to report.
	if (existsSync(file) && !readFileSync(file, "utf8").includes(DEV_PORT))
		return yield* new SpaceError({
			code: "DEV_PORT_UNREAD",
			message: `--port has no effect: the stack doesn't read ${DEV_PORT}`,
			file: INFRA_FILE,
			hint: `Add to the options of Cloudflare.Website.Vite: dev: process.env.${DEV_PORT} ? { port: Number(process.env.${DEV_PORT}), strictPort: true } : undefined,`,
		});
	const reason = yield* Effect.promise(() => listenError(port));
	if (reason)
		return yield* new SpaceError({
			code: "DEV_PORT_UNAVAILABLE",
			message: `Can't serve on port ${port}: ${reason}`,
			hint: "Stop what's using it, or give --port another one.",
		});
});

/** Runs Alchemy for the app at `root` and returns its exit code. */
export const runAlchemy = (root: string, command: AlchemyCommand, options: AlchemyOptions = {}) =>
	run(process.execPath, [alchemyCli(root), ...alchemyArgs(root, command, options)], {
		cwd: root,
		...(options.port === undefined ? {} : { env: { [DEV_PORT]: String(options.port) } }),
		// `alchemy dev` doesn't always exit on SIGTERM.
		killAfterMs: 5_000,
	});
